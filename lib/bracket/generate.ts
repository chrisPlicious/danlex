import { GF1, GF2, resolve } from "./advance";
import { BracketError, type Bracket, type BracketMatch, type Side, type Slot, type SlotRef } from "./types";

export const wCode = (round: number, pos: number) => `W${round}-${pos}`;
export const lCode = (round: number, pos: number) => `L${round}-${pos}`;

export function nextPowerOfTwo(n: number): number {
  let p = 2;
  while (p < n) p *= 2;
  return p;
}

/** Standard bracket seed order, e.g. 8 → [1, 8, 4, 5, 2, 7, 3, 6]; top seeds meet BYEs first. */
export function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const sum = order.length * 2 + 1;
    order = order.flatMap((s) => [s, sum - s]);
  }
  return order;
}

/** Matches per losers round j: L1 & L2 have size/4, L3 & L4 size/8, … */
const losersRoundSize = (size: number, j: number) => size / 2 ** (Math.floor((j + 1) / 2) + 1);

const feed = (code: string, i: number): SlotRef => ({ code, slot: i % 2 === 1 ? 1 : 2 });

function blank(code: string, side: Side, round: number, position: number): BracketMatch {
  return {
    code,
    side,
    round,
    position,
    slot1: { entrantId: null, bye: false },
    slot2: { entrantId: null, bye: false },
    games: [],
    winner: null,
    walkover: false,
    status: "pending",
    winnerTo: null,
    loserTo: null,
  };
}

/** Where the loser of winners-bracket match (r, i) drops into the losers bracket. */
function winnersLoserTarget(r: number, i: number, k: number, size: number): SlotRef {
  if (k === 1) return { code: GF1, slot: 2 };
  if (r === 1) return feed(lCode(1, Math.ceil(i / 2)), i);
  // WB round r drops into "major" losers round 2(r-1), which has the same match count.
  // Reversing the order on even rounds keeps a dropper away from the half they just came from.
  const count = size / 2 ** r;
  const pos = r % 2 === 0 ? count + 1 - i : i;
  return { code: lCode(2 * (r - 1), pos), slot: 2 };
}

/** Recovers the seed-ordered entrant list from winners round 1 (inverse of the seeding step). */
export function seedingOf(b: Bracket): string[] {
  const r1 = b.matches.filter((m) => m.side === "W" && m.round === 1).sort((x, y) => x.position - y.position);
  const order = seedOrder(r1.length * 2);
  const seeds: string[] = [];
  r1.forEach((m, i) => {
    if (m.slot1.entrantId) seeds[order[2 * i] - 1] = m.slot1.entrantId;
    if (m.slot2.entrantId) seeds[order[2 * i + 1] - 1] = m.slot2.entrantId;
  });
  return seeds.filter(Boolean);
}

/** True when the bracket places exactly these entrants, in any order. */
export function hasExactEntrants(b: Bracket, entrantIds: string[]): boolean {
  const placed = new Set(seedingOf(b));
  return placed.size === entrantIds.length && entrantIds.every((id) => placed.has(id));
}

export interface GenerateOptions {
  grandFinalReset: boolean;
}

/**
 * Builds a full double-elimination bracket. `entrantIds` must already be in seed order
 * (seed 1 first) — shuffle them beforehand for a random draw.
 */
export function generateDoubleElimination(entrantIds: string[], options: GenerateOptions): Bracket {
  const n = entrantIds.length;
  if (n < 2) throw new BracketError("At least 2 entrants are needed to make a bracket");
  if (new Set(entrantIds).size !== n) throw new BracketError("An entrant appears twice");

  const size = nextPowerOfTwo(n);
  const k = Math.log2(size);
  const matches: BracketMatch[] = [];

  for (let r = 1; r <= k; r++) {
    for (let i = 1; i <= size / 2 ** r; i++) {
      const m = blank(wCode(r, i), "W", r, i);
      m.winnerTo = r < k ? feed(wCode(r + 1, Math.ceil(i / 2)), i) : { code: GF1, slot: 1 };
      m.loserTo = winnersLoserTarget(r, i, k, size);
      matches.push(m);
    }
  }

  const seedSlot = (seed: number): Slot =>
    seed <= n ? { entrantId: entrantIds[seed - 1], bye: false } : { entrantId: null, bye: true };
  const order = seedOrder(size);
  for (let i = 0; i < size / 2; i++) {
    matches[i].slot1 = seedSlot(order[2 * i]);
    matches[i].slot2 = seedSlot(order[2 * i + 1]);
  }

  const lastLosersRound = 2 * (k - 1);
  for (let j = 1; j <= lastLosersRound; j++) {
    for (let i = 1; i <= losersRoundSize(size, j); i++) {
      const m = blank(lCode(j, i), "L", j, i);
      if (j === lastLosersRound) m.winnerTo = { code: GF1, slot: 2 };
      // odd rounds feed the same position of the next (major) round, slot 1; slot 2 takes a WB dropper
      else if (j % 2 === 1) m.winnerTo = { code: lCode(j + 1, i), slot: 1 };
      else m.winnerTo = feed(lCode(j + 1, Math.ceil(i / 2)), i);
      matches.push(m);
    }
  }

  matches.push(blank(GF1, "GF", 1, 1));
  if (options.grandFinalReset) matches.push(blank(GF2, "GF", 2, 1));

  const bracket: Bracket = { grandFinalReset: options.grandFinalReset, matches };
  resolve(bracket);
  return bracket;
}
