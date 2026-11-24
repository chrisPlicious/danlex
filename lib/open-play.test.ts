import { describe, expect, it } from "vitest";
import {
  clock,
  countdown,
  courtDateTime,
  courtParts,
  gameSeconds,
  normalizePhone,
  openPlayStandings,
  pairsOf,
  playerStates,
  rotationOrder,
  suggestNextGame,
} from "./open-play";
import type { Level, QueueGame, QueuePlayer, SessionQueue } from "./types";

const at = (min: number) => new Date(Date.UTC(2026, 10, 20, 10, min)).toISOString();

function player(id: string, level: Level, checkedIn: number | null, extra: Partial<QueuePlayer> = {}): QueuePlayer {
  return {
    id,
    name: id.toUpperCase(),
    level,
    checkedInAt: checkedIn === null ? null : at(checkedIn),
    paused: false,
    partnerId: null,
    lastEndedAt: null,
    ...extra,
  };
}

function game(number: number, team1: [string, string], team2: [string, string], status: QueueGame["status"] = "done"): QueueGame {
  return { id: `g${number}`, number, status, team1, team2, score1: null, score2: null, startedAt: at(0), endedAt: status === "done" ? at(number * 15) : null };
}

/** A finished game with a score that took `minutes`. */
function result(number: number, team1: [string, string], team2: [string, string], score1: number, score2: number, minutes = 10): QueueGame {
  const start = number * 20;
  return { id: `g${number}`, number, status: "done", team1, team2, score1, score2, startedAt: at(start), endedAt: at(start + minutes) };
}

const queue = (players: QueuePlayer[], games: QueueGame[], extra: Partial<SessionQueue> = {}): SessionQueue => ({
  partnerMode: "random",
  tiebreak: "win_time",
  maxGames: 5,
  players,
  games,
  ...extra,
});

const four = ["p1", "p2", "p3", "p4"].map((id, i) => player(id, 2, i));
const record = (q: SessionQueue) =>
  Object.fromEntries(openPlayStandings(q).map((s) => [s.ids.join("+"), `${s.won}W ${s.lost}L`]));

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

  it("avoids every earlier partnership, not just the last game's", () => {
    const players = [player("a", 2, 0), player("b", 2, 1), player("c", 2, 2), player("d", 2, 3)];
    const games = [game(1, ["a", "b"], ["c", "d"]), game(2, ["a", "c"], ["b", "d"])];
    expect(suggestNextGame(players, games)).toEqual({ team1: ["a", "d"], team2: ["b", "c"] });
  });

  it("stops offering a player after the game limit", () => {
    const games = [1, 2, 3, 4, 5].map((n) => game(n, ["p1", "x"], ["y", "z"]));
    const states = playerStates(four, games, 5);
    expect(states[0]).toMatchObject({ played: 5, maxedOut: true, ready: false });
    expect(rotationOrder(states).map((s) => s.player.id)).toEqual(["p2", "p3", "p4"]);
    expect(suggestNextGame(four, games)).toBeNull();
  });

  it("fixed partners: suggests the two pairs that have waited longest", () => {
    const pair = (a: string, b: string) => [
      player(a, 2, 0, { partnerId: b }),
      player(b, 2, 0, { partnerId: a }),
    ];
    const players = [...pair("a", "b"), ...pair("c", "d"), ...pair("e", "f"), player("g", 2, 0)];
    expect(pairsOf(players)).toEqual([["a", "b"], ["c", "d"], ["e", "f"]]);
    const games = [game(1, ["a", "b"], ["c", "d"])];
    // a+b and c+d have one game each; e+f has none, so e+f plays next against a waiting pair
    expect(suggestNextGame(players, games, { partnerMode: "fixed" })?.team1).toEqual(["e", "f"]);
    expect(suggestNextGame(players.slice(0, 2), [], { partnerMode: "fixed" })).toBeNull();
  });

  it("ignores a one-sided partner link", () => {
    expect(pairsOf([player("a", 2, 0, { partnerId: "b" }), player("b", 2, 0)])).toEqual([]);
  });
});

describe("game clock", () => {
  it("measures a finished game", () => {
    expect(gameSeconds(result(1, ["a", "b"], ["c", "d"], 11, 7, 12))).toBe(720);
    expect(gameSeconds(game(1, ["a", "b"], ["c", "d"], "playing"))).toBeNull();
    expect(clock(725)).toBe("12:05");
  });
});

describe("standings", () => {
  it("counts wins and losses for each player when partners change", () => {
    // game 1: p1+p2 beat p3+p4; game 2: p3+p2 beat p1+p4
    const games = [result(1, ["p1", "p2"], ["p3", "p4"], 11, 6), result(2, ["p1", "p4"], ["p3", "p2"], 8, 11)];
    expect(record(queue(four, games))).toEqual({ p1: "1W 1L", p2: "2W 0L", p3: "1W 1L", p4: "0W 2L" });
    // p1 and p3 are level and won in the same time, so the other tiebreak decides: p3 scored 6 in
    // their loss, p1 scored 8, and the lower total ranks higher
    expect(openPlayStandings(queue(four, games)).map((s) => s.ids[0])).toEqual(["p2", "p3", "p1", "p4"]);
  });

  it("skips games that are still playing", () => {
    const games = [game(1, ["p1", "p2"], ["p3", "p4"], "playing")];
    expect(openPlayStandings(queue(four, games)).every((s) => s.played === 0)).toBe(true);
  });

  it("fastest wins: the lower average time of won games ranks higher", () => {
    const games = [
      result(1, ["p1", "x1"], ["y1", "z1"], 11, 5, 8), // p1 wins in 8 min
      result(2, ["p2", "x2"], ["y2", "z2"], 11, 5, 6), // p2 wins in 6 min
    ];
    const s = openPlayStandings(queue(four, games));
    expect(s.slice(0, 2).map((x) => [x.ids[0], x.avgWinSeconds, x.tied])).toEqual([
      ["p2", 360, true],
      ["p1", 480, true],
    ]);
  });

  it("last two losses: the lower total of own points ranks higher", () => {
    // p1 scores 7 then 6 in losses (13); p2 scores 5 then 7 (12). Both 0W 2L.
    const games = [
      result(1, ["p1", "x"], ["y", "z"], 7, 11),
      result(2, ["p2", "x"], ["y", "z"], 5, 11),
      result(3, ["p1", "x"], ["y", "z"], 6, 11),
      result(4, ["p2", "x"], ["y", "z"], 7, 11),
    ];
    const s = openPlayStandings(queue(four.slice(0, 2), games, { tiebreak: "last_two_losses" }));
    expect(s.map((x) => [x.ids[0], x.lastTwoLossPoints, x.rank])).toEqual([
      ["p2", 12, 1],
      ["p1", 13, 2],
    ]);
  });

  it("only counts the two most recent losses", () => {
    const games = [
      result(1, ["p1", "x"], ["y", "z"], 0, 11),
      result(2, ["p1", "x"], ["y", "z"], 9, 11),
      result(3, ["p1", "x"], ["y", "z"], 9, 11),
    ];
    expect(openPlayStandings(queue([four[0]], games))[0].lastTwoLossPoints).toBe(18);
  });

  it("falls back to the other tiebreak, then shares the rank", () => {
    const games = [
      result(1, ["p1", "x"], ["y", "z"], 11, 5, 8),
      result(2, ["p2", "x"], ["y", "z"], 11, 5, 8),
      result(3, ["p1", "x"], ["y", "z"], 4, 11),
      result(4, ["p2", "x"], ["y", "z"], 6, 11),
    ];
    // same record and same win time: last two losses decides (4 beats 6)
    expect(openPlayStandings(queue(four.slice(0, 2), games)).map((x) => x.ids[0])).toEqual(["p1", "p2"]);
    const even = [result(1, ["p1", "x"], ["y", "z"], 11, 5, 8), result(2, ["p2", "x"], ["y", "z"], 11, 5, 8)];
    expect(openPlayStandings(queue(four.slice(0, 2), even)).map((x) => x.rank)).toEqual([1, 1]);
  });

  it("fixed partners: one row per pair", () => {
    const players = [
      player("a", 2, 0, { partnerId: "b" }),
      player("b", 2, 0, { partnerId: "a" }),
      player("c", 2, 0, { partnerId: "d" }),
      player("d", 2, 0, { partnerId: "c" }),
      player("e", 2, 0),
    ];
    const games = [result(1, ["a", "b"], ["c", "d"], 11, 9)];
    expect(record(queue(players, games, { partnerMode: "fixed" }))).toEqual({ "a+b": "1W 0L", "c+d": "0W 1L", e: "0W 0L" });
  });
});
