import { scoreGames } from "./scoring";
import {
  BracketError,
  type Bracket,
  type BracketMatch,
  type Game,
  type MatchFormat,
  type Slot,
  type SlotIndex,
  type SlotRef,
} from "./types";

export const GF1 = "GF1";
export const GF2 = "GF2";

const EMPTY: Slot = { entrantId: null, bye: false };
const BYE: Slot = { entrantId: null, bye: true };

const isFilled = (s: Slot) => s.bye || s.entrantId !== null;
const isDecided = (m: BracketMatch) => m.status === "completed" || m.status === "bye";
const other = (i: SlotIndex): SlotIndex => (i === 1 ? 2 : 1);

export function findMatch(b: Bracket, code: string): BracketMatch {
  const m = b.matches.find((x) => x.code === code);
  if (!m) throw new BracketError(`Match ${code} does not exist`);
  return m;
}

export function slotOf(m: BracketMatch, i: SlotIndex): Slot {
  return i === 1 ? m.slot1 : m.slot2;
}

function setSlot(b: Bracket, ref: SlotRef, value: Slot) {
  const t = findMatch(b, ref.code);
  if (ref.slot === 1) t.slot1 = { ...value };
  else t.slot2 = { ...value };
}

/** Grand final 1 has no fixed routing: a reset is only played if the losers-bracket champion wins it. */
function settleGrandFinal(b: Bracket, gf1: BracketMatch) {
  const gf2 = b.matches.find((m) => m.code === GF2);
  if (!gf2) return;
  if (gf1.winner === 2) {
    gf2.slot1 = { ...gf1.slot1 };
    gf2.slot2 = { ...gf1.slot2 };
    gf2.status = "pending";
  } else {
    gf2.status = "not_needed";
  }
}

function propagate(b: Bracket, m: BracketMatch) {
  if (m.code === GF1) return settleGrandFinal(b, m);
  const winner = m.winner ? slotOf(m, m.winner) : BYE;
  const loser = m.winner ? slotOf(m, other(m.winner)) : BYE;
  if (m.winnerTo) setSlot(b, m.winnerTo, winner);
  if (m.loserTo) setSlot(b, m.loserTo, loser);
}

/** Settles statuses and auto-advances BYE matches until nothing changes. */
export function resolve(b: Bracket): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of b.matches) {
      if (isDecided(m) || m.status === "not_needed") continue;
      if (!isFilled(m.slot1) || !isFilled(m.slot2)) {
        if (m.status !== "pending") {
          m.status = "pending";
          changed = true;
        }
        continue;
      }
      if (m.slot1.bye || m.slot2.bye) {
        m.status = "bye";
        m.winner = m.slot1.bye ? (m.slot2.bye ? null : 2) : 1;
        propagate(b, m);
        changed = true;
        continue;
      }
      if (m.status === "pending") {
        m.status = "ready";
        changed = true;
      }
    }
  }
}

function complete(b: Bracket, m: BracketMatch, winner: SlotIndex, games: Game[], walkover: boolean) {
  m.games = games.map((g) => ({ ...g }));
  m.winner = winner;
  m.walkover = walkover;
  m.status = "completed";
  propagate(b, m);
  resolve(b);
}

function assertPlayable(m: BracketMatch) {
  if (m.status !== "ready" && m.status !== "live") {
    throw new BracketError(`Match ${m.code} is not ready to be scored`);
  }
}

/**
 * Records game scores. On an already-completed match, a same-winner edit only updates
 * the scores; a winner change clears every downstream result first (see previewUndo).
 */
export function recordResult(b: Bracket, code: string, games: Game[], format: MatchFormat): string[] {
  const m = findMatch(b, code);
  const result = scoreGames(games, format);
  if (!result.ok) throw new BracketError(result.error);

  if (m.status === "completed") {
    if (m.winner === result.winner && !m.walkover) {
      m.games = games.map((g) => ({ ...g }));
      return [];
    }
    const cleared = undoResult(b, code);
    complete(b, m, result.winner, games, false);
    return cleared.filter((c) => c !== code);
  }

  assertPlayable(m);
  complete(b, m, result.winner, games, false);
  return [];
}

/** Forfeit / no-show: winner advances without scores. */
export function recordWalkover(b: Bracket, code: string, winner: SlotIndex): string[] {
  const m = findMatch(b, code);
  let cleared: string[] = [];
  if (m.status === "completed") cleared = undoResult(b, code).filter((c) => c !== code);
  else assertPlayable(m);
  complete(b, m, winner, [], true);
  return cleared;
}

function targets(b: Bracket, m: BracketMatch): SlotRef[] {
  if (m.code === GF1) {
    return b.matches.some((x) => x.code === GF2)
      ? [
          { code: GF2, slot: 1 },
          { code: GF2, slot: 2 },
        ]
      : [];
  }
  return [m.winnerTo, m.loserTo].filter((r): r is SlotRef => r !== null);
}

function reset(b: Bracket, m: BracketMatch, cleared: string[]) {
  for (const ref of targets(b, m)) {
    const t = findMatch(b, ref.code);
    if (isDecided(t) || t.status === "not_needed") reset(b, t, cleared);
    setSlot(b, ref, EMPTY);
  }
  if (m.status === "completed") cleared.push(m.code);
  m.games = [];
  m.winner = null;
  m.walkover = false;
  m.status = "pending";
}

/** Clears a result and every result that depended on it. Returns codes of cleared completed matches. */
export function undoResult(b: Bracket, code: string): string[] {
  const m = findMatch(b, code);
  if (m.status !== "completed") throw new BracketError(`Match ${code} has no result to undo`);
  const cleared: string[] = [];
  reset(b, m, cleared);
  resolve(b);
  return cleared;
}

/** Which completed matches an undo of `code` would wipe (including itself). */
export function previewUndo(b: Bracket, code: string): string[] {
  return undoResult(structuredClone(b), code);
}

export function winnerId(m: BracketMatch): string | null {
  return m.winner ? slotOf(m, m.winner).entrantId : null;
}

export function loserId(m: BracketMatch): string | null {
  return m.winner ? slotOf(m, other(m.winner)).entrantId : null;
}

/** Deciding grand final once the tournament is over, else null. */
function decidingFinal(b: Bracket): BracketMatch | null {
  const gf1 = findMatch(b, GF1);
  const gf2 = b.matches.find((m) => m.code === GF2);
  if (gf2 && isDecided(gf2)) return gf2;
  if (isDecided(gf1) && (!gf2 || gf2.status === "not_needed")) return gf1;
  return null;
}

export function getChampion(b: Bracket): string | null {
  const final = decidingFinal(b);
  return final ? winnerId(final) : null;
}

export interface Podium {
  first: string | null;
  second: string | null;
  third: string | null;
}

export function getPodium(b: Bracket): Podium {
  const final = decidingFinal(b);
  const lbFinal = b.matches
    .filter((m) => m.side === "L")
    .reduce<BracketMatch | null>((last, m) => (!last || m.round > last.round ? m : last), null);
  return {
    first: final ? winnerId(final) : null,
    second: final ? loserId(final) : null,
    third: lbFinal && isDecided(lbFinal) ? loserId(lbFinal) : null,
  };
}
