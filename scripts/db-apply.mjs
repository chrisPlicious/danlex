// Applies supabase/migrations/*.sql (in order) and, with --seed, supabase/seed.sql.
// Usage: node --env-file=.env.local scripts/db-apply.mjs [--seed]
// Needs SUPABASE_DB_URL (Dashboard → Connect → Session pooler URI), or just SUPABASE_DB_PASSWORD,
// in which case the direct host and the regional poolers are tried in turn.
// Applied files are tracked in public._danlex_migrations so re-running only applies new ones.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const REGIONS = [
  "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-northeast-2", "ap-south-1",
  "us-east-1", "us-east-2", "us-west-1", "us-west-2", "ca-central-1", "sa-east-1",
  "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1", "eu-central-2", "eu-north-1",
];

function candidates() {
  const given = process.env.SUPABASE_DB_URL ?? "";
  if (/^postgres(ql)?:\/\//.test(given)) return [given];

  const password = process.env.SUPABASE_DB_PASSWORD;
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://x").hostname.split(".")[0];
  if (!password || !ref) return [];
  const pw = encodeURIComponent(password);
  return [
    `postgresql://postgres:${pw}@db.${ref}.supabase.co:5432/postgres`,
    ...REGIONS.flatMap((r) =>
      [0, 1].map((n) => `postgresql://postgres.${ref}:${pw}@aws-${n}-${r}.pooler.supabase.com:5432/postgres`),
    ),
  ];
}

async function connect() {
  for (const url of candidates()) {
    const host = new URL(url).hostname;
    const sql = postgres(url, { ssl: "require", max: 1, connect_timeout: 6, onnotice: () => {} });
    try {
      await sql`select 1`;
      console.log(`connected via ${host}`);
      return sql;
    } catch (e) {
      await sql.end({ timeout: 1 }).catch(() => {});
      if (/password authentication failed/i.test(e.message)) {
        throw new Error("Database password was rejected. Reset it in Supabase → Database settings.");
      }
    }
  }
  throw new Error("Could not reach the database. Set SUPABASE_DB_URL to the Session pooler URI.");
}

const root = path.resolve(import.meta.dirname, "..");
const sql = await connect();

try {
  await sql`create table if not exists public._danlex_migrations (name text primary key, applied_at timestamptz not null default now())`;
  await sql`alter table public._danlex_migrations enable row level security`;
  const applied = new Set((await sql`select name from public._danlex_migrations`).map((r) => r.name));

  const dir = path.join(root, "supabase", "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip   ${file}`);
      continue;
    }
    const body = await readFile(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into public._danlex_migrations (name) values (${file})`;
    });
    console.log(`apply  ${file}`);
  }

  if (process.argv.includes("--seed")) {
    const [{ count }] = await sql`select count(*)::int as count from public.tournaments`;
    if (count > 0) {
      console.log("seed   skipped (tournaments already exist)");
    } else {
      await sql.unsafe(await readFile(path.join(root, "supabase", "seed.sql"), "utf8"));
      console.log("seed   applied");
    }
  }
} finally {
  await sql.end();
}
