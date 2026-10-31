// Creates (or promotes) the organiser account.
// Usage: node --env-file=.env.local scripts/create-admin.mjs
// Reads ADMIN_EMAIL / ADMIN_PASSWORD plus the Supabase URL + service key from the env file.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!url || !key || !email || !password) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL and ADMIN_PASSWORD.");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const appMeta = { role: "admin" };

const { data: list, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
if (listErr) throw listErr;
const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

if (existing) {
  const { error } = await sb.auth.admin.updateUserById(existing.id, { password, app_metadata: appMeta });
  if (error) throw error;
  console.log(`Updated admin ${email}`);
} else {
  const { error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: appMeta });
  if (error) throw error;
  console.log(`Created admin ${email}`);
}
