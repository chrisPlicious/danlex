import { describe, expect, it } from "vitest";
import { describeFormat, scoreGames } from "./scoring";

const to11 = { gamesToWin: 1, pointsTo: 11, winBy: 2 };
const bo3 = { gamesToWin: 2, pointsTo: 11, winBy: 2 };

describe("scoreGames", () => {
  it("derives winner for a single game", () => {
    expect(scoreGames([{ p1: 11, p2: 5 }], to11)).toEqual({ ok: true, winner: 1 });
    expect(scoreGames([{ p1: 10, p2: 12 }], to11)).toEqual({ ok: true, winner: 2 });
  });

  it("enforces points, margin and plausible deuce scores", () => {
    expect(scoreGames([{ p1: 10, p2: 8 }], to11).ok).toBe(false);
    expect(scoreGames([{ p1: 11, p2: 10 }], to11).ok).toBe(false);
    expect(scoreGames([{ p1: 14, p2: 9 }], to11).ok).toBe(false);
    expect(scoreGames([{ p1: 15, p2: 13 }], to11).ok).toBe(true);
  });

  it("handles best of 3", () => {
    expect(scoreGames([{ p1: 11, p2: 3 }, { p1: 11, p2: 9 }], bo3)).toEqual({ ok: true, winner: 1 });
    expect(
      scoreGames(
        [
          { p1: 11, p2: 3 },
          { p1: 5, p2: 11 },
          { p1: 9, p2: 11 },
        ],
        bo3,
      ),
    ).toEqual({ ok: true, winner: 2 });
    expect(scoreGames([{ p1: 11, p2: 3 }], bo3).ok).toBe(false);
    expect(
      scoreGames(
        [
          { p1: 11, p2: 3 },
          { p1: 11, p2: 3 },
          { p1: 11, p2: 3 },
        ],
        bo3,
      ).ok,
    ).toBe(false);
  });

  it("rejects empty and non-integer input", () => {
    expect(scoreGames([], to11).ok).toBe(false);
    expect(scoreGames([{ p1: 11.5, p2: 3 }], to11).ok).toBe(false);
  });

  it("describes formats", () => {
    expect(describeFormat(to11)).toBe("1 game · to 11, win by 2");
    expect(describeFormat(bo3)).toBe("Best of 3 · to 11, win by 2");
  });
});
