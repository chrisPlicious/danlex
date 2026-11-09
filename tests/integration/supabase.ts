import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_FORMAT,
  GF1,
  GF2,
  findMatch,
  generateDoubleElimination,
  getChampion,
  randomSeed,
  recordResult,
  shuffle,
  undoResult,
} from "@/lib/bracket";
import { toCreatePayload, toEngine, toSavePayload } from "@/lib/bracket-db";
import type { BracketRow, MatchRow } from "@/lib/types";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const anon = createClient(url, anonKey, opts);
const admin = createClient(url, anonKey, opts);
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, opts);

const TEST_EMAIL = "%@example.com";
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);

let singlesId = "";
const count = async (id: string) =>
  (await service.from("divisions").select("confirmed_count").eq("id", id).single()).data!.confirmed_count as number;

async function register(i: number) {
  const path = `${singlesId}/${crypto.randomUUID()}.jpg`;
  await service.storage.from("payment-proofs").upload(path, JPEG, { contentType: "image/jpeg" });
  return service.rpc("register_entry", {
    p_division_id: singlesId,
    p_player1_name: `Int Player ${i}`,
    p_player1_phone: "09170000000",
    p_player1_email: `int${i}-${Date.now()}@example.com`,
    p_player2_name: "should be dropped",
    p_player2_phone: null,
    p_player2_email: null,
    p_team_name: null,
    p_payment_proof_path: path,
    p_payment_ref: null,
  });
}

async function cleanup() {
  await service.from("brackets").delete().eq("division_id", singlesId);
  const { data } = await service
    .from("registrations")
    .delete()
    .like("player1_email", TEST_EMAIL)
    .select("payment_proof_path");
  const paths = (data ?? []).map((r) => r.payment_proof_path).filter(Boolean) as string[];
  if (paths.length) await service.storage.from("payment-proofs").remove(paths);
  await service.from("divisions").update({ registration_open: true }).neq("id", "00000000-0000-0000-0000-000000000000");
}

beforeAll(async () => {
  const { error } = await admin.auth.signInWithPassword({
    email: process.env.ADMIN_EMAIL!,
    password: process.env.ADMIN_PASSWORD!,
  });
  if (error) throw error;
  const { data } = await service.from("divisions").select("id, kind").eq("kind", "singles").single();
  singlesId = data!.id;
  await cleanup();
});

afterAll(async () => {
  // KEEP_TEST_DATA=1 leaves the finished test bracket in place to eyeball /bracket; the next run clears it
  if (!process.env.KEEP_TEST_DATA) await cleanup();
});

describe("registration", () => {
  it("takes every entry under concurrency, with no limit", async () => {
    const results = await Promise.all([1, 2, 3, 4, 5, 6, 7].map(register));
    expect(results.filter((r) => r.error)).toEqual([]);
    expect(await count(singlesId)).toBe(7);
  });

  it("refuses entries while registration is closed", async () => {
    await service.from("divisions").update({ registration_open: false }).eq("id", singlesId);
    const closed = await register(8);
    await service.from("divisions").update({ registration_open: true }).eq("id", singlesId);
    expect(closed.error?.message).toContain("REGISTRATION_CLOSED");
    expect(await count(singlesId)).toBe(7);
  });

  it("drops partner fields on singles entries", async () => {
    const { data } = await service.from("registrations").select("player2_name").like("player1_email", TEST_EMAIL);
    expect(data!.every((r) => r.player2_name === null)).toBe(true);
  });

  it("keeps contact details and proofs away from anonymous visitors", async () => {
    expect((await anon.from("registrations").select("*")).data).toEqual([]);
    expect((await anon.storage.from("payment-proofs").list(singlesId)).data ?? []).toEqual([]);
    const rpc = await anon.rpc("register_entry", {
      p_division_id: singlesId,
      p_player1_name: "x",
      p_player1_phone: "x",
      p_player1_email: "x@example.com",
      p_player2_name: null,
      p_player2_phone: null,
      p_player2_email: null,
      p_team_name: null,
      p_payment_proof_path: null,
      p_payment_ref: null,
    });
    expect(rpc.error).not.toBeNull();

    const { data: entrants } = await anon.rpc("get_public_entrants", { p_division_id: singlesId });
    expect(entrants).toHaveLength(7);
    expect(Object.keys(entrants![0]).sort()).toEqual(["created_at", "display_name", "id"]);
  });

  it("keeps the count right through reject, walk-in, and restore", async () => {
    const { data: regs } = await admin
      .from("registrations")
      .select("id")
      .eq("division_id", singlesId)
      .eq("status", "confirmed")
      .like("player1_email", TEST_EMAIL);
    const target = regs![0].id;

    await admin.from("registrations").update({ status: "rejected" }).eq("id", target);
    expect(await count(singlesId)).toBe(6);

    const walkIn = await admin
      .from("registrations")
      .insert({
        division_id: singlesId,
        confirmation_code: `DLX-T${Date.now().toString(16).slice(-7).toUpperCase()}`,
        player1_name: "Int Walk-in",
        player1_phone: "0917",
        player1_email: `walkin-${Date.now()}@example.com`,
        source: "admin",
      })
      .select("id")
      .single();
    expect(walkIn.error).toBeNull();
    expect(await count(singlesId)).toBe(7);

    const restore = await admin.from("registrations").update({ status: "confirmed" }).eq("id", target);
    expect(restore.error).toBeNull();
    expect(await count(singlesId)).toBe(8);

    await admin.from("registrations").delete().eq("id", walkIn.data!.id);
    expect(await count(singlesId)).toBe(7);
  });
});

describe("bracket lifecycle", () => {
  let bracketId = "";

  async function load() {
    const { data: bracket } = await admin.from("brackets").select("*").eq("id", bracketId).single<BracketRow>();
    const { data: rows } = await admin.from("matches").select("*").eq("bracket_id", bracketId).returns<MatchRow[]>();
    return { bracket: bracket!, rows: rows! };
  }

  it("creates a random draft only admins can see", async () => {
    const { data: regs } = await admin
      .from("registrations")
      .select("id")
      .eq("division_id", singlesId)
      .eq("status", "confirmed");
    const seed = randomSeed();
    const b = generateDoubleElimination(shuffle(regs!.map((r) => r.id), seed), { grandFinalReset: true });
    const { data, error } = await admin.rpc("create_bracket", {
      p_division_id: singlesId,
      p_rng_seed: seed,
      p_grand_final_reset: true,
      p_matches: toCreatePayload(b),
    });
    expect(error).toBeNull();
    bracketId = data as string;

    const { rows } = await load();
    const w1 = rows.filter((m) => m.side === "W" && m.round === 1);
    expect(w1.filter((m) => m.status === "bye")).toHaveLength(1);
    expect(w1.filter((m) => m.status === "ready")).toHaveLength(3);
    expect((await anon.from("matches").select("id").eq("bracket_id", bracketId)).data).toEqual([]);
  });

  it("publishes and plays through a grand-final reset", async () => {
    await admin.from("brackets").update({ status: "published" }).eq("id", bracketId);
    expect((await anon.from("matches").select("id").eq("bracket_id", bracketId)).data!.length).toBeGreaterThan(0);

    for (let guard = 0; guard < 40; guard++) {
      const { bracket, rows } = await load();
      const engine = toEngine(true, rows);
      const next = engine.matches.find((m) => m.status === "ready");
      if (!next) break;
      // force the losers-bracket champion to take GF1 so the reset is exercised
      const games = next.code === GF1 ? [{ p1: 5, p2: 11 }] : [{ p1: 11, p2: 6 }];
      recordResult(engine, next.code, games, DEFAULT_FORMAT);
      const { error } = await admin.rpc("save_bracket", {
        p_bracket_id: bracketId,
        p_version: bracket.version,
        p_matches: toSavePayload(engine, rows),
      });
      expect(error).toBeNull();
    }

    const { rows } = await load();
    const engine = toEngine(true, rows);
    expect(findMatch(engine, GF2).status).toBe("completed");
    expect(getChampion(engine)).not.toBeNull();
    expect(rows.filter((m) => m.status === "completed")).toHaveLength(2 * 7 - 2 + 1);
  });

  it("rejects stale saves and supports undo", async () => {
    const { bracket, rows } = await load();
    const engine = toEngine(true, rows);
    undoResult(engine, GF2);

    const stale = await admin.rpc("save_bracket", {
      p_bracket_id: bracketId,
      p_version: bracket.version - 1,
      p_matches: toSavePayload(engine, rows),
    });
    expect(stale.error?.message).toContain("STALE_BRACKET");

    const ok = await admin.rpc("save_bracket", {
      p_bracket_id: bracketId,
      p_version: bracket.version,
      p_matches: toSavePayload(engine, rows),
    });
    expect(ok.error).toBeNull();
    const after = toEngine(true, (await load()).rows);
    expect(findMatch(after, GF2).status).toBe("ready");
    expect(getChampion(after)).toBeNull();
  });

  it("anonymous visitors cannot write matches", async () => {
    const { data } = await anon.from("matches").update({ court: "hacked" }).eq("bracket_id", bracketId).select("id");
    expect(data ?? []).toEqual([]);
    const { rows } = await load();
    expect(rows.some((m) => m.court === "hacked")).toBe(false);
  });
});
