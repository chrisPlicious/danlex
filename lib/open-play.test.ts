import { describe, expect, it } from "vitest";
import {
  countdown,
  courtDateTime,
  courtParts,
  normalizePhone,
  playerStates,
  rotationOrder,
  suggestNextGame,
} from "./open-play";
import type { Level, QueueGame, QueuePlayer } from "./types";

const at = (min: number) => new Date(Date.UTC(2026, 10, 20, 10, min)).toISOString();

function player(id: string, level: Level, checkedIn: number | null, extra: Partial<QueuePlayer> = {}): QueuePlayer {
  return { id, name: id.toUpperCase(), level, checkedInAt: checkedIn === null ? null : at(checkedIn), paused: false, lastEndedAt: null, ...extra };
}

function game(number: number, team1: [string, string], team2: [string, string], status: QueueGame["status"] = "done"): QueueGame {
  return { id: `g${number}`, number, status, team1, team2, score1: null, score2: null, startedAt: at(0), endedAt: status === "done" ? at(number * 15) : null };
}

describe("court-local times", () => {
  it("turns Manila wall time into an instant and back", () => {
    expect(courtDateTime("2026-11-20", "18:30").toISOString()).toBe("2026-11-20T10:30:00.000Z");
    expect(courtDateTime("2026-11-20", "00:00").toISOString()).toBe("2026-11-19T16:00:00.000Z");
    expect(courtParts("2026-11-20T10:30:00.000Z")).toEqual({ day: "2026-11-20", time: "18:30" });
    expect(courtParts("2026-11-19T16:00:00.000Z")).toEqual({ day: "2026-11-20", time: "00:00" });
  });

  it("normalizes phones like the database", () => {
    expect(normalizePhone("+63 917 123 4567")).toBe("09171234567");
    expect(normalizePhone("0917-123-4567")).toBe("09171234567");
    expect(normalizePhone("(02) 8123 4567")).toBe("0281234567");
  });

  it("formats a countdown", () => {
    expect(countdown(14 * 60_000 + 5_000)).toBe("14:05");
    expect(countdown(-3000)).toBe("0:00");
  });
});

describe("game queue", () => {
  it("only offers checked-in, unpaused players who are off court", () => {
    const players = [
      player("a", 2, 0),
      player("b", 2, null),
      player("c", 2, 1, { paused: true }),
      player("d", 2, 2),
    ];
    const games = [game(1, ["d", "x"], ["y", "z"], "playing")];
    expect(rotationOrder(playerStates(players, games)).map((s) => s.player.id)).toEqual(["a"]);
  });

  it("puts fewest games and longest wait first", () => {
    const players = [
      player("a", 2, 0, { lastEndedAt: at(30) }),
      player("b", 2, 5),
      player("c", 2, 1, { lastEndedAt: at(15) }),
      player("d", 2, 20),
    ];
    const games = [game(1, ["a", "c"], ["x", "y"]), game(2, ["a", "x"], ["y", "z"])];
    // b and d have played 0 (b checked in first), then c (1 game), then a (2 games)
    expect(rotationOrder(playerStates(players, games)).map((s) => s.player.id)).toEqual(["b", "d", "c", "a"]);
  });

  it("needs four ready players", () => {
    expect(suggestNextGame([player("a", 1, 0), player("b", 1, 1), player("c", 1, 2)], [])).toBeNull();
  });

  it("balances levels: strongest with weakest", () => {
    const players = [player("a", 3, 0), player("b", 1, 1), player("c", 2, 2), player("d", 2, 3)];
    const m = suggestNextGame(players, []);
    expect(m?.team1).toEqual(["a", "b"]);
    expect([...(m?.team2 ?? [])].sort()).toEqual(["c", "d"]);
  });

  it("avoids repeating last game's partners", () => {
    const players = [player("a", 3, 0), player("b", 1, 1), player("c", 2, 2), player("d", 2, 3)];
    const games = [game(1, ["a", "b"], ["c", "d"])];
    const m = suggestNextGame(players, games);
    // levels sort a(3) c(2) d(2) b(1); a+b vs c+d is last game, so a+d vs c+b
    expect(m).toEqual({ team1: ["a", "d"], team2: ["c", "b"] });
  });
});
