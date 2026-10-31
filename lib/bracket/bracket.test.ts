import { describe, expect, it } from "vitest";
import {
  BracketError,
  DEFAULT_FORMAT,
  GF1,
  GF2,
  findMatch,
  generateDoubleElimination,
  getChampion,
  getPodium,
  loserId,
  mulberry32,
  previewUndo,
  recordResult,
  recordWalkover,
  seedOrder,
  seedingOf,
  shuffle,
  undoResult,
  winnerId,
  type Bracket,
  type Game,
} from "./index";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const win1: Game[] = [{ p1: 11, p2: 7 }];
const win2: Game[] = [{ p1: 4, p2: 11 }];

const playable = (b: Bracket) => b.matches.filter((m) => m.status === "ready" || m.status === "live");

/** Plays every match with random winners; returns the bracket at the end. */
function playOut(b: Bracket, rand: () => number) {
  for (let guard = 0; guard < 500; guard++) {
    const next = playable(b)[0];
    if (!next) return;
    recordResult(b, next.code, rand() < 0.5 ? win1 : win2, DEFAULT_FORMAT);
  }
  throw new Error("bracket never finished");
}

function lossCounts(b: Bracket) {
  const losses = new Map<string, number>();
  for (const m of b.matches) {
    if (m.status !== "completed") continue;
    const l = loserId(m)!;
    losses.set(l, (losses.get(l) ?? 0) + 1);
  }
  return losses;
}

describe("seedOrder", () => {
  it("pairs top seeds with bottom seeds", () => {
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
});

describe("structure", () => {
  it.each([2, 3, 4, 5, 6, 7, 8, 9, 13, 16, 17, 32])("routes every slot exactly once for %i entrants", (n) => {
    const b = generateDoubleElimination(ids(n), { grandFinalReset: true });
    const fed = new Map<string, number>();
    for (const m of b.matches) {
      for (const ref of [m.winnerTo, m.loserTo]) {
        if (!ref) continue;
        expect(() => findMatch(b, ref.code)).not.toThrow();
        const key = `${ref.code}:${ref.slot}`;
        fed.set(key, (fed.get(key) ?? 0) + 1);
      }
    }
    for (const m of b.matches) {
      if (m.side === "W" && m.round === 1) continue; // seeded directly
      if (m.code === GF2) continue; // filled by GF1 outcome
      expect(fed.get(`${m.code}:1`)).toBe(1);
      expect(fed.get(`${m.code}:2`)).toBe(1);
    }
  });

  it("never pairs two BYEs in winners round 1 and seats every entrant once", () => {
    for (let n = 2; n <= 32; n++) {
      const b = generateDoubleElimination(ids(n), { grandFinalReset: true });
      const r1 = b.matches.filter((m) => m.side === "W" && m.round === 1);
      expect(r1.some((m) => m.slot1.bye && m.slot2.bye)).toBe(false);
      const seated = r1.flatMap((m) => [m.slot1.entrantId, m.slot2.entrantId]).filter(Boolean);
      expect(new Set(seated).size).toBe(n);
    }
  });

  it("5 entrants → bracket of 8, 3 byes auto-advanced", () => {
    const b = generateDoubleElimination(ids(5), { grandFinalReset: true });
    const r1 = b.matches.filter((m) => m.side === "W" && m.round === 1);
    expect(r1).toHaveLength(4);
    expect(r1.filter((m) => m.status === "bye")).toHaveLength(3);
    expect(r1.filter((m) => m.status === "ready")).toHaveLength(1);
  });

  it("seedingOf recovers the original seed order", () => {
    for (let n = 2; n <= 20; n++) {
      const order = shuffle(ids(n), n);
      expect(seedingOf(generateDoubleElimination(order, { grandFinalReset: true }))).toEqual(order);
    }
  });

  it("rejects fewer than 2 or duplicate entrants", () => {
    expect(() => generateDoubleElimination(["a"], { grandFinalReset: true })).toThrow(BracketError);
    expect(() => generateDoubleElimination(["a", "a"], { grandFinalReset: true })).toThrow(BracketError);
  });
});

describe("full simulation", () => {
  for (const reset of [true, false]) {
    it(`finishes with correct counts for N=2..32 (reset=${reset})`, () => {
      for (let n = 2; n <= 32; n++) {
        for (let trial = 0; trial < 15; trial++) {
          const rand = mulberry32(n * 1000 + trial);
          const b = generateDoubleElimination(shuffle(ids(n), n + trial), { grandFinalReset: reset });
          playOut(b, rand);

          const champion = getChampion(b);
          expect(champion).not.toBeNull();
          expect(b.matches.every((m) => ["completed", "bye", "not_needed"].includes(m.status))).toBe(true);
          expect(b.matches.some((m) => m.status === "ready" && (m.slot1.bye || m.slot2.bye))).toBe(false);

          const gf1 = findMatch(b, GF1);
          const resetPlayed = reset && gf1.winner === 2;
          const played = b.matches.filter((m) => m.status === "completed").length;
          expect(played).toBe(2 * n - 2 + (resetPlayed ? 1 : 0));

          // with a reset every non-champion is out on exactly 2 losses; without one,
          // the winners-bracket champion can go out on a single GF1 loss
          const losses = lossCounts(b);
          for (const p of ids(n)) {
            const l = losses.get(p) ?? 0;
            if (p === champion) expect(l).toBeLessThanOrEqual(1);
            else if (reset) expect(l).toBe(2);
            else expect([1, 2]).toContain(l);
          }
        }
      }
    });
  }
});

describe("grand final reset", () => {
  it("GF2 only played when losers-bracket champion wins GF1", () => {
    const b = generateDoubleElimination(["a", "b"], { grandFinalReset: true });
    recordResult(b, "W1-1", win1, DEFAULT_FORMAT); // a wins WB, b drops
    expect(findMatch(b, GF1).status).toBe("ready");

    recordResult(b, GF1, win2, DEFAULT_FORMAT); // b (LB champ) wins → reset
    expect(findMatch(b, GF2).status).toBe("ready");
    expect(getChampion(b)).toBeNull();

    recordResult(b, GF2, win2, DEFAULT_FORMAT);
    expect(getChampion(b)).toBe("b");
    expect(getPodium(b)).toMatchObject({ first: "b", second: "a" });
  });

  it("GF2 not needed when winners-bracket champion wins GF1", () => {
    const b = generateDoubleElimination(["a", "b"], { grandFinalReset: true });
    recordResult(b, "W1-1", win1, DEFAULT_FORMAT);
    recordResult(b, GF1, win1, DEFAULT_FORMAT);
    expect(findMatch(b, GF2).status).toBe("not_needed");
    expect(getChampion(b)).toBe("a");
  });
});

describe("undo and edits", () => {
  it("undo restores the exact prior state", () => {
    for (let n = 3; n <= 16; n++) {
      const rand = mulberry32(n);
      const b = generateDoubleElimination(ids(n), { grandFinalReset: true });
      // play a few matches, snapshot, play one more, undo it
      for (let s = 0; s < n; s++) {
        const m = playable(b)[0];
        if (!m) break;
        recordResult(b, m.code, rand() < 0.5 ? win1 : win2, DEFAULT_FORMAT);
      }
      const next = playable(b)[0];
      if (!next) continue;
      const before = structuredClone(b);
      recordResult(b, next.code, win1, DEFAULT_FORMAT);
      undoResult(b, next.code);
      expect(b).toEqual(before);
    }
  });

  it("undo cascades through dependent results", () => {
    const b = generateDoubleElimination(ids(4), { grandFinalReset: true });
    recordResult(b, "W1-1", win1, DEFAULT_FORMAT);
    recordResult(b, "W1-2", win1, DEFAULT_FORMAT);
    recordResult(b, "W2-1", win1, DEFAULT_FORMAT);
    expect(previewUndo(b, "W1-1").sort()).toEqual(["W1-1", "W2-1"]);
    expect(findMatch(b, "W2-1").status).toBe("completed"); // preview does not mutate

    undoResult(b, "W1-1");
    expect(findMatch(b, "W2-1").status).toBe("pending");
    expect(findMatch(b, "W2-1").slot1.entrantId).toBeNull();
    expect(findMatch(b, "L1-1").slot1.entrantId).toBeNull();
  });

  it("editing scores with the same winner keeps downstream results", () => {
    const b = generateDoubleElimination(ids(4), { grandFinalReset: true });
    recordResult(b, "W1-1", win1, DEFAULT_FORMAT);
    recordResult(b, "W1-2", win1, DEFAULT_FORMAT);
    recordResult(b, "W2-1", win1, DEFAULT_FORMAT);
    const cleared = recordResult(b, "W1-1", [{ p1: 12, p2: 10 }], DEFAULT_FORMAT);
    expect(cleared).toEqual([]);
    expect(findMatch(b, "W2-1").status).toBe("completed");
    expect(findMatch(b, "W1-1").games).toEqual([{ p1: 12, p2: 10 }]);
  });

  it("changing the winner clears downstream and re-routes", () => {
    const b = generateDoubleElimination(ids(4), { grandFinalReset: true });
    recordResult(b, "W1-1", win1, DEFAULT_FORMAT);
    recordResult(b, "W1-2", win1, DEFAULT_FORMAT);
    recordResult(b, "W2-1", win1, DEFAULT_FORMAT);
    const cleared = recordResult(b, "W1-1", win2, DEFAULT_FORMAT);
    expect(cleared).toEqual(["W2-1"]);
    const w11 = findMatch(b, "W1-1");
    expect(findMatch(b, "W2-1").slot1.entrantId).toBe(winnerId(w11));
    expect(findMatch(b, "L1-1").slot1.entrantId).toBe(loserId(w11));
  });

  it("walkover advances without scores", () => {
    const b = generateDoubleElimination(ids(4), { grandFinalReset: true });
    recordWalkover(b, "W1-1", 2);
    const m = findMatch(b, "W1-1");
    expect(m.walkover).toBe(true);
    expect(m.games).toEqual([]);
    expect(findMatch(b, "W2-1").slot1.entrantId).toBe(m.slot2.entrantId);
  });

  it("refuses to score a match that is not ready", () => {
    const b = generateDoubleElimination(ids(4), { grandFinalReset: true });
    expect(() => recordResult(b, "W2-1", win1, DEFAULT_FORMAT)).toThrow(BracketError);
  });
});

describe("shuffle", () => {
  it("is deterministic per seed and keeps every entrant", () => {
    expect(shuffle(ids(10), 42)).toEqual(shuffle(ids(10), 42));
    expect(shuffle(ids(10), 42)).not.toEqual(shuffle(ids(10), 43));
    expect([...shuffle(ids(10), 7)].sort()).toEqual(ids(10).sort());
  });
});
