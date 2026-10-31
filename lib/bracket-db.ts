import type { Bracket, BracketMatch, Side } from "@/lib/bracket";
import type { MatchRow } from "@/lib/types";

const SIDE_ORDER: Record<Side, number> = { W: 0, L: 1, GF: 2 };

export function sortMatches<T extends Pick<BracketMatch, "side" | "round" | "position">>(matches: T[]): T[] {
  return [...matches].sort(
    (a, b) => SIDE_ORDER[a.side] - SIDE_ORDER[b.side] || a.round - b.round || a.position - b.position,
  );
}

export function rowToMatch(r: MatchRow): BracketMatch {
  return {
    code: r.code,
    side: r.side,
    round: r.round,
    position: r.position,
    slot1: { entrantId: r.slot1_reg_id, bye: r.slot1_bye },
    slot2: { entrantId: r.slot2_reg_id, bye: r.slot2_bye },
    games: r.games ?? [],
    winner: r.winner,
    walkover: r.walkover,
    status: r.status,
    winnerTo: r.winner_to_code && r.winner_to_slot ? { code: r.winner_to_code, slot: r.winner_to_slot } : null,
    loserTo: r.loser_to_code && r.loser_to_slot ? { code: r.loser_to_code, slot: r.loser_to_slot } : null,
  };
}

export function toEngine(grandFinalReset: boolean, rows: MatchRow[]): Bracket {
  return { grandFinalReset, matches: sortMatches(rows.map(rowToMatch)) };
}

/** Full rows for create_bracket. */
export function toCreatePayload(b: Bracket) {
  return b.matches.map((m) => ({
    code: m.code,
    side: m.side,
    round: m.round,
    position: m.position,
    slot1_reg_id: m.slot1.entrantId,
    slot1_bye: m.slot1.bye,
    slot2_reg_id: m.slot2.entrantId,
    slot2_bye: m.slot2.bye,
    games: m.games,
    winner: m.winner,
    walkover: m.walkover,
    status: m.status,
    winner_to_code: m.winnerTo?.code ?? null,
    winner_to_slot: m.winnerTo?.slot ?? null,
    loser_to_code: m.loserTo?.code ?? null,
    loser_to_slot: m.loserTo?.slot ?? null,
  }));
}

/** Mutable fields for save_bracket; court/time come from the stored rows unless overridden. */
export function toSavePayload(
  b: Bracket,
  rows: MatchRow[],
  overrides: Record<string, Partial<Pick<MatchRow, "court" | "scheduled_at">>> = {},
) {
  const byCode = new Map(rows.map((r) => [r.code, r]));
  return b.matches.map((m) => {
    const row = byCode.get(m.code);
    const o = overrides[m.code] ?? {};
    return {
      code: m.code,
      slot1_reg_id: m.slot1.entrantId,
      slot1_bye: m.slot1.bye,
      slot2_reg_id: m.slot2.entrantId,
      slot2_bye: m.slot2.bye,
      games: m.games,
      winner: m.winner,
      walkover: m.walkover,
      status: m.status,
      court: o.court !== undefined ? o.court : (row?.court ?? null),
      scheduled_at: o.scheduled_at !== undefined ? o.scheduled_at : (row?.scheduled_at ?? null),
    };
  });
}
