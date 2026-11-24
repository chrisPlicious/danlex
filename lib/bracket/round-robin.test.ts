import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORMAT,
  generateRoundRobin,
  hasExactEntrants,
  isFinished,
  isRoundRobin,
  previewUndo,
  recordResult,
  recordWalkover,
  roundRobinOrder,
  roundRobinStandings,
  undoResult,
  type Bracket,
} from "./index";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);
const code = (b: Bracket, x: string, y: string) =>
  b.matches.find((m) => [m.slot1.entrantId, m.slot2.entrantId].sort().join() === [x, y].sort().join())!.code;

describe("roundRobinOrder", () => {
  it("matches the organiser's sheet for 5 teams", () => {
    expect(roundRobinOrder(5)).toEqual([
      [1, 2], [3, 4], [1, 5], [2, 3], [4, 5], [1, 3], [2, 4], [3, 5], [1, 4], [2, 5],
    ]);
  });

  it.each([2, 3, 4, 5, 6, 7, 8, 9, 12, 16])("pairs all %i entries exactly once", (n) => {
    const order = roundRobinOrder(n);
    expect(order).toHaveLength((n * (n - 1)) / 2);
    expect(new Set(order.map(([a, b]) => `${a}-${b}`)).size).toBe(order.length);
    for (const [a, b] of order) expect(a).toBeLessThan(b);
  });

  it("never has a team play twice in a row for 5 teams", () => {
    const order = roundRobinOrder(5);
    for (let i = 1; i < order.length; i++) {
      expect(order[i].some((s) => order[i - 1].includes(s))).toBe(false);
    }
  });
});

describe("generateRoundRobin", () => {
  it("builds ready, numbered games with the lower seed first", () => {
    const b = generateRoundRobin(ids(5));
    expect(isRoundRobin(b)).toBe(true);
    expect(b.matches.map((m) => m.code)).toEqual(Array.from({ length: 10 }, (_, i) => `RR-${i + 1}`));
    expect(b.matches.every((m) => m.status === "ready" && !m.winnerTo && !m.loserTo)).toBe(true);
    expect([b.matches[2].slot1.entrantId, b.matches[2].slot2.entrantId]).toEqual(["t1", "t5"]);
    expect(hasExactEntrants(b, ids(5))).toBe(true);
    expect(hasExactEntrants(b, [...ids(5), "late"])).toBe(false);
  });

  it("rejects fewer than two or duplicate entrants", () => {
    expect(() => generateRoundRobin(["a"])).toThrow();
    expect(() => generateRoundRobin(["a", "a"])).toThrow();
  });

  it("scores, walks over and undoes a game without touching the others", () => {
    const b = generateRoundRobin(ids(4));
    expect(recordResult(b, "RR-1", [{ p1: 11, p2: 6 }], DEFAULT_FORMAT)).toEqual([]);
    expect(b.matches[0]).toMatchObject({ status: "completed", winner: 1 });
    expect(b.matches.slice(1).every((m) => m.status === "ready")).toBe(true);
    expect(previewUndo(b, "RR-1")).toEqual(["RR-1"]);
    undoResult(b, "RR-1");
    expect(b.matches[0]).toMatchObject({ status: "ready", winner: null, games: [] });
    recordWalkover(b, "RR-2", 2);
    expect(b.matches[1]).toMatchObject({ status: "completed", winner: 2, walkover: true });
  });

  it("is finished only when every game is played", () => {
    const b = generateRoundRobin(ids(3));
    for (const m of b.matches.slice(0, -1)) recordResult(b, m.code, [{ p1: 11, p2: 3 }], DEFAULT_FORMAT);
    expect(isFinished(b)).toBe(false);
    recordResult(b, b.matches.at(-1)!.code, [{ p1: 3, p2: 11 }], DEFAULT_FORMAT);
    expect(isFinished(b)).toBe(true);
  });
});

describe("roundRobinStandings", () => {
  it("lists every entrant before any game, in seed order", () => {
    const b = generateRoundRobin(ids(5));
    expect(roundRobinStandings(b.matches).map((s) => s.entrantId)).toEqual(ids(5));
  });

  it("ranks by wins, then point difference, counting points from both sides", () => {
    const b = generateRoundRobin(ids(3));
    recordResult(b, code(b, "t1", "t2"), [{ p1: 11, p2: 9 }], DEFAULT_FORMAT); // t1 beats t2
    recordResult(b, code(b, "t2", "t3"), [{ p1: 11, p2: 2 }], DEFAULT_FORMAT); // t2 beats t3
    recordResult(b, code(b, "t1", "t3"), [{ p1: 4, p2: 11 }], DEFAULT_FORMAT); // t3 beats t1
    const s = roundRobinStandings(b.matches);
    // all 1-1: t2 +7, t3 -2, t1 -5
    expect(s.map((x) => x.entrantId)).toEqual(["t2", "t3", "t1"]);
    expect(s[0]).toMatchObject({ played: 2, won: 1, lost: 1, pointsFor: 20, pointsAgainst: 13 });
  });

  it("settles a two-way tie on wins by head-to-head before point difference", () => {
    const b = generateRoundRobin(ids(4));
    const r = (x: string, y: string, p1: number, p2: number) => recordResult(b, code(b, x, y), [{ p1, p2 }], DEFAULT_FORMAT);
    // t1 and t2 both finish 2-1; t2 beat t1 but t1 has the far better point difference
    r("t1", "t2", 9, 11);
    r("t1", "t3", 11, 0);
    r("t1", "t4", 11, 0);
    r("t2", "t3", 11, 9);
    r("t2", "t4", 9, 11);
    r("t3", "t4", 11, 9);
    const s = roundRobinStandings(b.matches);
    expect(s.slice(0, 2).map((x) => x.entrantId)).toEqual(["t2", "t1"]);
  });

  it("counts a walkover as a win and a loss with no points", () => {
    const b = generateRoundRobin(ids(2));
    recordWalkover(b, "RR-1", 2);
    const [first, second] = roundRobinStandings(b.matches);
    expect(first).toMatchObject({ entrantId: "t2", won: 1, pointsFor: 0 });
    expect(second).toMatchObject({ entrantId: "t1", lost: 1 });
  });
});
