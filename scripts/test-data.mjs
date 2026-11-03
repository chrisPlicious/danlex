// Test entrants for trying out registration limits and bracket draws.
//   node --env-file=.env.local scripts/test-data.mjs seed    fill every open division up to its slot cap
//   node --env-file=.env.local scripts/test-data.mjs clear   remove test entrants and any bracket that uses them
// Test entrants use @example.com emails; real registrations are never touched.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
const TEST_EMAILS = "%@example.com";

const PLAYERS = [
  "Miguel Santos", "Ana Reyes", "Paolo Cruz", "Bea Mendoza", "Carlo Garcia", "Jasmine Torres",
  "Rafael Bautista", "Nicole Villanueva", "Marco Ramos", "Trisha Flores", "Kevin Aquino", "Leah Castillo",
  "Joshua Navarro", "Camille Domingo", "Enzo Pascual", "Mika Salazar",
];
const TEAMS = ["Dink Dynasty", "Kitchen Kings", "Third Shot Drop", "Net Ninjas", "Lob Squad", "Erne Express", null, null];

// 1×1 white JPEG standing in for a payment screenshot
const RECEIPT = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);

const slug = (name) => name.toLowerCase().replace(/[^a-z]+/g, ".");

async function seed() {
  const { data: divisions, error } = await sb
    .from("divisions")
    .select("id, name, kind, slot_cap, confirmed_count, registration_open")
    .order("sort_order");
  if (error) throw error;

  for (const d of divisions) {
    const open = d.slot_cap - d.confirmed_count;
    if (!d.registration_open || open <= 0) {
      console.log(`${d.name}: ${d.confirmed_count}/${d.slot_cap} — ${open <= 0 ? "already full" : "registration closed"}, skipped`);
      continue;
    }
    let added = 0;
    for (let i = 0; i < open; i++) {
      const n = d.confirmed_count + i;
      const p1 = PLAYERS[(n * (d.kind === "doubles" ? 2 : 1)) % PLAYERS.length];
      const p2 = d.kind === "doubles" ? PLAYERS[(n * 2 + 1) % PLAYERS.length] : null;
      const path = `${d.id}/${crypto.randomUUID()}.jpg`;
      const up = await sb.storage.from("payment-proofs").upload(path, RECEIPT, { contentType: "image/jpeg" });
      if (up.error) throw up.error;
      const { error: rErr } = await sb.rpc("register_entry", {
        p_division_id: d.id,
        p_player1_name: p1,
        p_player1_phone: `0917${String(1000000 + n * 7919).slice(-7)}`,
        p_player1_email: `${slug(p1)}.${d.kind}${n}@example.com`,
        p_player2_name: p2,
        p_player2_phone: null,
        p_player2_email: p2 ? `${slug(p2)}.${d.kind}${n}@example.com` : null,
        p_team_name: d.kind === "doubles" ? TEAMS[n % TEAMS.length] : null,
        p_payment_proof_path: path,
        p_payment_ref: `TEST-${String(n + 1).padStart(4, "0")}`,
      });
      if (rErr) {
        await sb.storage.from("payment-proofs").remove([path]);
        console.log(`${d.name}: stopped — ${rErr.message}`);
        break;
      }
      added++;
    }
    console.log(`${d.name}: added ${added} test ${d.kind === "doubles" ? "teams" : "players"} → ${d.confirmed_count + added}/${d.slot_cap}`);
  }
}

async function clear() {
  const { data: regs, error } = await sb.from("registrations").select("division_id").like("player1_email", TEST_EMAILS);
  if (error) throw error;
  const divisions = [...new Set(regs.map((r) => r.division_id))];
  if (divisions.length) {
    const { data: gone } = await sb.from("brackets").delete().in("division_id", divisions).select("id");
    if (gone?.length) console.log(`removed ${gone.length} bracket(s) that used test entrants`);
    await sb.from("divisions").update({ registration_open: true }).in("id", divisions);
  }
  const { data: removed } = await sb
    .from("registrations")
    .delete()
    .like("player1_email", TEST_EMAILS)
    .select("payment_proof_path");
  const paths = (removed ?? []).map((r) => r.payment_proof_path).filter(Boolean);
  if (paths.length) await sb.storage.from("payment-proofs").remove(paths);
  console.log(`removed ${removed?.length ?? 0} test entrants`);
}

const command = process.argv[2];
if (command === "seed") await seed();
else if (command === "clear") await clear();
else {
  console.error("Usage: scripts/test-data.mjs seed|clear");
  process.exit(1);
}
