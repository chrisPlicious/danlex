"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminClient } from "@/lib/auth";
import {
  BracketError,
  findMatch,
  generateDoubleElimination,
  getChampion,
  hasExactEntrants,
  previewUndo,
  randomSeed,
  recordResult,
  recordWalkover,
  seedingOf,
  shuffle,
  undoResult,
  type Bracket,
  type MatchFormat,
} from "@/lib/bracket";
import { toCreatePayload, toEngine, toSavePayload } from "@/lib/bracket-db";
import type { BracketRow, MatchFormatRow, MatchRow } from "@/lib/types";

export type BracketResult = { ok: true; cleared?: string[] } | { ok: false; error: string };
const fail = (error: string): BracketResult => ({ ok: false, error });

const Id = z.uuid();
const Code = z.string().regex(/^(?:[WL]\d{1,2}-\d{1,3}|GF[12])$/);
const Games = z.array(z.object({ p1: z.number().int().min(0).max(99), p2: z.number().int().min(0).max(99) })).max(9);

// Supabase returns at most 1,000 rows per read by default. 257+ entrants need 1,023 match rows,
// so a bigger bracket would load with matches missing.
const MAX_ENTRANTS = 256;

type Sb = Awaited<ReturnType<typeof adminClient>>;

function revalidate(divisionId: string) {
  revalidatePath("/bracket");
  revalidatePath("/admin/brackets");
  revalidatePath(`/admin/brackets/${divisionId}`);
}

async function confirmedEntrants(sb: Sb, divisionId: string) {
  const { data, error } = await sb
    .from("registrations")
    .select("id")
    .eq("division_id", divisionId)
    .eq("status", "confirmed")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}

async function saveNew(sb: Sb, divisionId: string, seed: number, b: Bracket): Promise<BracketResult> {
  const { error } = await sb.rpc("create_bracket", {
    p_division_id: divisionId,
    p_rng_seed: seed,
    p_grand_final_reset: b.grandFinalReset,
    p_matches: toCreatePayload(b),
  });
  if (error) {
    return fail(
      error.message.includes("BRACKET_ALREADY_PUBLISHED")
        ? "This bracket is already published. Revert it to draft first."
        : error.message,
    );
  }
  revalidate(divisionId);
  return { ok: true };
}

/** Random draw of every confirmed entrant. Also used to re-shuffle a draft. */
export async function generateBracket(divisionId: string): Promise<BracketResult> {
  if (!Id.safeParse(divisionId).success) return fail("Invalid division");
  const sb = await adminClient();
  const { data: division } = await sb
    .from("divisions")
    .select("grand_final_reset")
    .eq("id", divisionId)
    .single<{ grand_final_reset: boolean }>();
  if (!division) return fail("Division not found");

  const ids = await confirmedEntrants(sb, divisionId);
  if (ids.length < 2) return fail("At least 2 confirmed entries are needed to draw a bracket.");
  if (ids.length > MAX_ENTRANTS) {
    return fail(`A bracket can hold ${MAX_ENTRANTS} entries and this division has ${ids.length}. Split it into two divisions.`);
  }

  const seed = randomSeed();
  const b = generateDoubleElimination(shuffle(ids, seed), { grandFinalReset: division.grand_final_reset });
  return saveNew(sb, divisionId, seed, b);
}

/** Draft only: swap two entrants' draw positions. */
export async function swapEntrants(bracketId: string, a: string, b: string): Promise<BracketResult> {
  if (![bracketId, a, b].every((x) => Id.safeParse(x).success) || a === b) return fail("Pick two different entrants");
  const sb = await adminClient();
  const { bracket, rows } = await load(sb, bracketId);
  if (bracket.status !== "draft") return fail("Positions can only be swapped while the bracket is a draft.");

  const order = seedingOf(toEngine(bracket.grand_final_reset, rows));
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  if (ia < 0 || ib < 0) return fail("Both entrants must be in the bracket");
  [order[ia], order[ib]] = [order[ib], order[ia]];
  const next = generateDoubleElimination(order, { grandFinalReset: bracket.grand_final_reset });
  return saveNew(sb, bracket.division_id, bracket.rng_seed, next);
}

async function load(sb: Sb, bracketId: string) {
  const { data: bracket, error } = await sb
    .from("brackets")
    .select("*, divisions(match_format)")
    .eq("id", bracketId)
    .single<BracketRow & { divisions: { match_format: MatchFormatRow } }>();
  if (error || !bracket) throw new BracketError("Bracket not found");
  const { data: rows, error: mErr } = await sb.from("matches").select("*").eq("bracket_id", bracketId).returns<MatchRow[]>();
  if (mErr) throw mErr;
  const f = bracket.divisions.match_format;
  const format: MatchFormat = { gamesToWin: f.games_to_win, pointsTo: f.points_to, winBy: f.win_by };
  return { bracket, rows: rows ?? [], format };
}

type Mutation = (ctx: {
  engine: Bracket;
  format: MatchFormat;
}) => { cleared?: string[]; overrides?: Record<string, { court?: string | null }> } | void;

async function mutate(bracketId: string, fn: Mutation, { requirePublished = true } = {}): Promise<BracketResult> {
  if (!Id.safeParse(bracketId).success) return fail("Invalid bracket");
  const sb = await adminClient();
  try {
    const { bracket, rows, format } = await load(sb, bracketId);
    if (requirePublished && bracket.status === "draft") return fail("Publish the bracket before entering results.");

    const engine = toEngine(bracket.grand_final_reset, rows);
    const out = fn({ engine, format }) ?? {};

    const { error } = await sb.rpc("save_bracket", {
      p_bracket_id: bracketId,
      p_version: bracket.version,
      p_matches: toSavePayload(engine, rows, out.overrides),
    });
    if (error) {
      return fail(
        error.message.includes("STALE_BRACKET")
          ? "The bracket was changed somewhere else. Refresh and try again."
          : error.message,
      );
    }

    if (bracket.status !== "draft") {
      const status = getChampion(engine) ? "completed" : "published";
      if (status !== bracket.status) await sb.from("brackets").update({ status }).eq("id", bracketId);
    }
    revalidate(bracket.division_id);
    return { ok: true, cleared: out.cleared };
  } catch (e) {
    if (e instanceof BracketError) return fail(e.message);
    throw e;
  }
}

export async function scoreMatch(bracketId: string, code: string, games: { p1: number; p2: number }[]) {
  const c = Code.safeParse(code);
  const g = Games.safeParse(games);
  if (!c.success || !g.success) return fail("Invalid scores");
  return mutate(bracketId, ({ engine, format }) => ({ cleared: recordResult(engine, c.data, g.data, format) }));
}

export async function walkoverMatch(bracketId: string, code: string, winner: 1 | 2) {
  const c = Code.safeParse(code);
  if (!c.success || ![1, 2].includes(winner)) return fail("Invalid walkover");
  return mutate(bracketId, ({ engine }) => ({ cleared: recordWalkover(engine, c.data, winner) }));
}

export async function undoMatch(bracketId: string, code: string) {
  const c = Code.safeParse(code);
  if (!c.success) return fail("Invalid match");
  return mutate(bracketId, ({ engine }) => ({ cleared: undoResult(engine, c.data) }));
}

/** Read-only: which results an undo or winner change would wipe. */
export async function previewUndoMatch(bracketId: string, code: string): Promise<BracketResult> {
  const c = Code.safeParse(code);
  if (!Id.safeParse(bracketId).success || !c.success) return fail("Invalid match");
  const sb = await adminClient();
  try {
    const { bracket, rows } = await load(sb, bracketId);
    return { ok: true, cleared: previewUndo(toEngine(bracket.grand_final_reset, rows), c.data) };
  } catch (e) {
    if (e instanceof BracketError) return fail(e.message);
    throw e;
  }
}

export async function updateMatchDetails(bracketId: string, code: string, details: { court: string; live: boolean }) {
  const c = Code.safeParse(code);
  if (!c.success) return fail("Invalid match");
  const court = details.court.trim().slice(0, 20) || null;
  return mutate(
    bracketId,
    ({ engine }) => {
      const m = findMatch(engine, c.data);
      if (m.status === "ready" && details.live) m.status = "live";
      else if (m.status === "live" && !details.live) m.status = "ready";
      return { overrides: { [c.data]: { court } } };
    },
    { requirePublished: false },
  );
}

export async function publishBracket(bracketId: string): Promise<BracketResult> {
  if (!Id.safeParse(bracketId).success) return fail("Invalid bracket");
  const sb = await adminClient();
  const { bracket, rows } = await load(sb, bracketId);
  if (bracket.status !== "draft") return fail("Already published");

  // The draw is final, so no late entries. Closing first also waits for any sign-up still in
  // progress (register_entry holds the division row lock), so the check below can't miss it.
  const { error: closeError } = await sb.from("divisions").update({ registration_open: false }).eq("id", bracket.division_id);
  if (closeError) return fail(closeError.message);

  const entrants = await confirmedEntrants(sb, bracket.division_id);
  if (!hasExactEntrants(toEngine(bracket.grand_final_reset, rows), entrants)) {
    revalidate(bracket.division_id);
    return fail("Entries changed since this draw, so it was not published. Registration is now closed. Re-shuffle to include everyone, then publish.");
  }

  const { error } = await sb
    .from("brackets")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", bracketId);
  if (error) return fail(error.message);
  revalidate(bracket.division_id);
  return { ok: true };
}

export async function revertToDraft(bracketId: string): Promise<BracketResult> {
  if (!Id.safeParse(bracketId).success) return fail("Invalid bracket");
  const sb = await adminClient();
  const { bracket, rows } = await load(sb, bracketId);
  if (rows.some((m) => m.status === "completed")) return fail("Undo all results before reverting to draft.");

  const { error } = await sb.from("brackets").update({ status: "draft", published_at: null }).eq("id", bracketId);
  if (error) return fail(error.message);
  revalidate(bracket.division_id);
  return { ok: true };
}

export async function deleteBracket(bracketId: string) {
  if (!Id.safeParse(bracketId).success) return fail("Invalid bracket");
  const sb = await adminClient();
  const { data } = await sb.from("brackets").delete().eq("id", bracketId).select("division_id").maybeSingle();
  if (!data) return fail("Bracket not found");
  revalidate(data.division_id as string);
  return { ok: true } as BracketResult;
}
