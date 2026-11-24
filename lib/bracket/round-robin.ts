import { getChampion } from "./advance";
import { BracketError, type Bracket, type BracketMatch } from "./types";

export const rrCode = (game: number) => `RR-${game}`;

export function isRoundRobin(b: Pick<Bracket, "matches">): boolean {
  return b.matches.some((m) => m.side === "RR");
}

/** Round robin: every game played. Double elimination: a champion is known. */
export function isFinished(b: Bracket): boolean {
  return isRoundRobin(b) ? b.matches.every((m) => m.status === "completed") : getChampion(b) !== null;
}

/**
 * Pairings (1-based seeds, lower seed first) for a full round robin, in play order.
 * Pairs are taken shortest seed gap first and, where possible, nobody plays two games in a row.
 * For 5 entries this is 1v2, 3v4, 1v5, 2v3, 4v5, 1v3, 2v4, 3v5, 1v4, 2v5.
 */
export function roundRobinOrder(n: number): [number, number][] {
  const pool: [number, number][] = [];
  for (let gap = 1; gap <= Math.floor(n / 2); gap++) {
    for (let i = 1; i <= n; i++) {
      // with an even count the half-way gap would list every pair twice
      if (gap * 2 === n && i > n / 2) continue;
      const j = ((i - 1 + gap) % n) + 1;
      pool.push(i < j ? [i, j] : [j, i]);
    }
  }
  const order: [number, number][] = [];
  while (pool.length) {
    const last = order.at(-1);
    const rested = last ? pool.findIndex(([a, b]) => !last.includes(a) && !last.includes(b)) : 0;
    order.push(pool.splice(Math.max(rested, 0), 1)[0]);
  }
  return order;
}

/** Every entrant plays every other once. `entrantIds` in seed order (seed 1 first). */
export function generateRoundRobin(entrantIds: string[]): Bracket {
  if (entrantIds.length < 2) throw new BracketError("At least 2 entrants are needed for a round robin");
  if (new Set(entrantIds).size !== entrantIds.length) throw new BracketError("An entrant appears twice");
  const matches: BracketMatch[] = roundRobinOrder(entrantIds.length).map(([a, b], i) => ({
    code: rrCode(i + 1),
    side: "RR",
    round: i + 1,
    position: 1,
    slot1: { entrantId: entrantIds[a - 1], bye: false },
    slot2: { entrantId: entrantIds[b - 1], bye: false },
    games: [],
    winner: null,
    walkover: false,
    status: "ready",
    winnerTo: null,
    loserTo: null,
  }));
  return { grandFinalReset: false, matches };
}

export interface Standing {
  entrantId: string;
  played: number;
  won: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
}

export const pointDiff = (s: Standing) => s.pointsFor - s.pointsAgainst;

/**
 * Table for a round robin. Ranked by wins, then head-to-head when exactly two entries are level,
 * then point difference, then points scored. Walkovers count as a win and a loss with no points.
 */
export function roundRobinStandings(matches: BracketMatch[]): Standing[] {
  const table = new Map<string, Standing>();
  const row = (id: string) => {
    let s = table.get(id);
    if (!s) table.set(id, (s = { entrantId: id, played: 0, won: 0, lost: 0, pointsFor: 0, pointsAgainst: 0 }));
    return s;
  };
  const sorted = [...matches].sort((x, y) => x.round - y.round);
  for (const m of sorted) {
    if (m.slot1.entrantId) row(m.slot1.entrantId);
    if (m.slot2.entrantId) row(m.slot2.entrantId);
  }

  const beat = new Set<string>();
  for (const m of sorted) {
    if (m.status !== "completed" || !m.winner || !m.slot1.entrantId || !m.slot2.entrantId) continue;
    const a = row(m.slot1.entrantId);
    const b = row(m.slot2.entrantId);
    a.played++;
    b.played++;
    const [w, l] = m.winner === 1 ? [a, b] : [b, a];
    w.won++;
    l.lost++;
    beat.add(`${w.entrantId}>${l.entrantId}`);
    for (const g of m.games) {
      a.pointsFor += g.p1;
      a.pointsAgainst += g.p2;
      b.pointsFor += g.p2;
      b.pointsAgainst += g.p1;
    }
  }

  const ranked = [...table.values()].sort(
    (x, y) => y.won - x.won || pointDiff(y) - pointDiff(x) || y.pointsFor - x.pointsFor,
  );
  // a two-way tie on wins is settled by the game between them
  for (let i = 0; i < ranked.length; i++) {
    const level = ranked.filter((s) => s.won === ranked[i].won);
    if (level.length === 2 && ranked[i] === level[0] && beat.has(`${level[1].entrantId}>${level[0].entrantId}`)) {
      [ranked[i], ranked[i + 1]] = [ranked[i + 1], ranked[i]];
    }
  }
  return ranked;
}
