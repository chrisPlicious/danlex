import type { Game, MatchFormat, SlotIndex } from "./types";

export const DEFAULT_FORMAT: MatchFormat = { gamesToWin: 1, pointsTo: 11, winBy: 2 };

export type ScoreResult = { ok: true; winner: SlotIndex } | { ok: false; error: string };

const fail = (error: string): ScoreResult => ({ ok: false, error });

export function describeFormat(f: MatchFormat): string {
  const games = f.gamesToWin === 1 ? "1 game" : `Best of ${f.gamesToWin * 2 - 1}`;
  return `${games} · to ${f.pointsTo}, win by ${f.winBy}`;
}

/** Validates game scores against the division format and derives the winning slot. */
export function scoreGames(games: Game[], f: MatchFormat): ScoreResult {
  if (games.length === 0) return fail("Enter at least one game score");

  let won1 = 0;
  let won2 = 0;
  for (const [i, g] of games.entries()) {
    const n = i + 1;
    if (won1 === f.gamesToWin || won2 === f.gamesToWin) {
      return fail(`Game ${n} was entered after the match was already decided`);
    }
    if (![g.p1, g.p2].every((s) => Number.isInteger(s) && s >= 0)) {
      return fail(`Game ${n}: scores must be whole numbers`);
    }
    const hi = Math.max(g.p1, g.p2);
    const lo = Math.min(g.p1, g.p2);
    if (hi < f.pointsTo) return fail(`Game ${n}: winner needs at least ${f.pointsTo} points`);
    if (hi - lo < f.winBy) return fail(`Game ${n}: must be won by ${f.winBy}`);
    if (hi > f.pointsTo && hi - lo !== f.winBy) {
      return fail(`Game ${n}: ${hi}-${lo} is not a possible final score`);
    }
    if (g.p1 > g.p2) won1++;
    else won2++;
  }

  if (won1 < f.gamesToWin && won2 < f.gamesToWin) {
    return fail(`Match not finished — first to ${f.gamesToWin} game${f.gamesToWin > 1 ? "s" : ""} wins`);
  }
  return { ok: true, winner: won1 > won2 ? 1 : 2 };
}
