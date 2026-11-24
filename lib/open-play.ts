// Open play helpers shared by the public pages and admin. Pure, so they run on server and client.
import type {
  Level,
  PartnerMode,
  QueueGame,
  QueuePlayer,
  SessionKind,
  SessionQueue,
  SignupStatus,
  Tiebreak,
} from "@/lib/types";

export const KIND_LABEL: Record<SessionKind, string> = {
  open_play: "Open play",
  beginner: "Beginner session",
};

export const LEVELS: { value: Level; label: string; hint: string }[] = [
  { value: 1, label: "Beginner", hint: "New to pickleball or still learning to rally." },
  { value: 2, label: "Intermediate", hint: "Comfortable with rallies, rules and the kitchen." },
  { value: 3, label: "Advanced", hint: "Competitive games, consistent drops and dinks." },
];

export const levelLabel = (level: number) => LEVELS.find((l) => l.value === level)?.label ?? `Level ${level}`;

export const SIGNUP_STATUS_LABEL: Record<SignupStatus, string> = {
  held: "Awaiting payment",
  confirmed: "Confirmed",
  waitlisted: "Waitlisted",
  offered: "Spot offered",
  cancelled: "Cancelled",
  expired: "Expired",
};

export const SIGNUP_CODE = /^DLS-[0-9A-F]{8}$/;

/** Spots are held this long while a new player pays (join_session). */
export const HOLD_MINUTES = 15;

/** Same as normalize_phone() in the database: digits only, a 63 mobile prefix becomes 0. */
export function normalizePhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return /^63\d{10}$/.test(d) ? `0${d.slice(2)}` : d;
}

/** "12:05" for a countdown; never negative. */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// court-local date + time (Manila has no daylight saving)
// ---------------------------------------------------------------------------

const OFFSET_MS = 8 * 60 * 60 * 1000;

/** The instant of a court-local "HH:MM" on a court-local YYYY-MM-DD. "24:00" is the next midnight. */
export function courtDateTime(day: string, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  return new Date(Date.parse(`${day}T00:00:00Z`) - OFFSET_MS + (h * 60 + m) * 60_000);
}

/** Court-local { day: "YYYY-MM-DD", time: "HH:MM" } of an instant, for form defaults. */
export function courtParts(iso: string): { day: string; time: string } {
  const local = new Date(Date.parse(iso) + OFFSET_MS).toISOString();
  return { day: local.slice(0, 10), time: local.slice(11, 16) };
}

// ---------------------------------------------------------------------------
// session rules
// ---------------------------------------------------------------------------

/** Most finished games one player may play in a session (also enforced by admin_start_game). */
export const MAX_GAMES = 5;

export const PARTNER_MODES: { value: PartnerMode; label: string; hint: string }[] = [
  {
    value: "random",
    label: "Random partners",
    hint: "New partner every game. Wins and losses count for each player.",
  },
  {
    value: "fixed",
    label: "Fixed partners",
    hint: "You pair players up at check-in. Each pair plays every game together.",
  },
];

export const TIEBREAKS: { value: Tiebreak; label: string; hint: string }[] = [
  {
    value: "win_time",
    label: "Fastest wins",
    hint: "Level on wins and losses? The lower average time of the games they won ranks higher.",
  },
  {
    value: "last_two_losses",
    label: "Last two losses",
    hint: "Level on wins and losses? Add up their own points in their two most recent losses. The lower total ranks higher.",
  },
];

export const partnerModeLabel = (m: PartnerMode) => PARTNER_MODES.find((x) => x.value === m)?.label ?? m;
export const tiebreakLabel = (t: Tiebreak) => TIEBREAKS.find((x) => x.value === t)?.label ?? t;

// ---------------------------------------------------------------------------
// games: winner and clock
// ---------------------------------------------------------------------------

/** Winning side of a finished, scored game; null while it's playing or unscored. */
export function gameWinner(g: Pick<QueueGame, "status" | "score1" | "score2">): 1 | 2 | null {
  if (g.status !== "done" || g.score1 === null || g.score2 === null || g.score1 === g.score2) return null;
  return g.score1 > g.score2 ? 1 : 2;
}

/** How long a finished game took, in whole seconds. */
export function gameSeconds(g: Pick<QueueGame, "startedAt" | "endedAt">): number | null {
  if (!g.endedAt) return null;
  return Math.max(0, Math.round((Date.parse(g.endedAt) - Date.parse(g.startedAt)) / 1000));
}

/** "12:05" for a game clock or an average; hours roll into minutes. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// fixed partners
// ---------------------------------------------------------------------------

/** Mutual pairs among these players, each once, in list order. Anyone else is unpaired. */
export function pairsOf(players: Pick<QueuePlayer, "id" | "partnerId">[]): [string, string][] {
  const ids = new Set(players.map((p) => p.id));
  const partnerOf = new Map(players.map((p) => [p.id, p.partnerId]));
  const seen = new Set<string>();
  const pairs: [string, string][] = [];
  for (const p of players) {
    const q = p.partnerId;
    if (!q || seen.has(p.id) || !ids.has(q) || partnerOf.get(q) !== p.id) continue;
    seen.add(p.id).add(q);
    pairs.push([p.id, q]);
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// game queue: who plays next on the one court
// ---------------------------------------------------------------------------

export interface PlayerState {
  player: QueuePlayer;
  /** Finished games. */
  played: number;
  onCourt: boolean;
  /** Reached the game limit for the session. */
  maxedOut: boolean;
  /** Checked in, not paused, not on court, under the game limit. */
  ready: boolean;
  /** When they last came off court, or checked in. Earlier means they've waited longer. */
  waitingSince: string | null;
}

export function playerStates(players: QueuePlayer[], games: QueueGame[], maxGames = MAX_GAMES): PlayerState[] {
  const playing = new Set(games.filter((g) => g.status === "playing").flatMap((g) => [...g.team1, ...g.team2]));
  const played = new Map<string, number>();
  for (const g of games) {
    if (g.status !== "done") continue;
    for (const id of [...g.team1, ...g.team2]) played.set(id, (played.get(id) ?? 0) + 1);
  }
  return players.map((p) => {
    const onCourt = playing.has(p.id);
    const count = played.get(p.id) ?? 0;
    const maxedOut = count >= maxGames;
    return {
      player: p,
      played: count,
      onCourt,
      maxedOut,
      ready: !!p.checkedInAt && !p.paused && !onCourt && !maxedOut,
      waitingSince: p.lastEndedAt ?? p.checkedInAt,
    };
  });
}

const waitTime = (s: Pick<PlayerState, "waitingSince">) =>
  s.waitingSince ? Date.parse(s.waitingSince) : Number.MAX_SAFE_INTEGER;

/** Fewest games first, then whoever has sat out longest, then check-in order. */
export function rotationOrder(states: PlayerState[]): PlayerState[] {
  return states
    .filter((s) => s.ready)
    .sort((a, b) => a.played - b.played || waitTime(a) - waitTime(b) || a.player.name.localeCompare(b.player.name));
}

/** Fixed partners: pairs with both players ready, fewest games first, then longest wait. */
export function pairRotation(states: PlayerState[]): [string, string][] {
  const byId = new Map(states.map((s) => [s.player.id, s]));
  return pairsOf(states.map((s) => s.player))
    .map((pair) => ({ pair, a: byId.get(pair[0])!, b: byId.get(pair[1])! }))
    .filter(({ a, b }) => a.ready && b.ready)
    .sort(
      (x, y) =>
        Math.max(x.a.played, x.b.played) - Math.max(y.a.played, y.b.played) ||
        // a pair is free once the later of the two came off court
        Math.max(waitTime(x.a), waitTime(x.b)) - Math.max(waitTime(y.a), waitTime(y.b)),
    )
    .map(({ pair }) => pair);
}

export interface Matchup {
  team1: [string, string];
  team2: [string, string];
}

/** How many finished games these two have played on the same side. */
function timesPartnered(games: QueueGame[], [x, y]: readonly [string, string]): number {
  return games.filter(
    (g) => g.status === "done" && [g.team1, g.team2].some((t) => t.includes(x) && t.includes(y)),
  ).length;
}

/**
 * Random partners: the next four off the bench, split so nobody repeats a partner if possible,
 * then so the levels even out (strongest + weakest vs the middle two).
 * Fixed partners: the two pairs that have waited longest.
 */
export function suggestNextGame(
  players: QueuePlayer[],
  games: QueueGame[],
  { partnerMode = "random", maxGames = MAX_GAMES }: { partnerMode?: PartnerMode; maxGames?: number } = {},
): Matchup | null {
  const states = playerStates(players, games, maxGames);
  if (partnerMode === "fixed") {
    const [p1, p2] = pairRotation(states);
    return p1 && p2 ? { team1: p1, team2: p2 } : null;
  }

  const next = rotationOrder(states).slice(0, 4);
  if (next.length < 4) return null;
  const byLevel = [...next].sort((x, y) => y.player.level - x.player.level);
  const [a, b, c, d] = byLevel.map((s) => s.player.id);
  const level = new Map(byLevel.map((s) => [s.player.id, s.player.level as number]));
  const strength = (t: [string, string]) => level.get(t[0])! + level.get(t[1])!;

  const splits: Matchup[] = [
    { team1: [a, d], team2: [b, c] },
    { team1: [a, c], team2: [b, d] },
    { team1: [a, b], team2: [c, d] },
  ];
  const cost = (m: Matchup) => [
    timesPartnered(games, m.team1) + timesPartnered(games, m.team2),
    Math.abs(strength(m.team1) - strength(m.team2)),
  ];
  return splits.reduce((best, m) => {
    const [r1, g1] = cost(m);
    const [r2, g2] = cost(best);
    return r1 < r2 || (r1 === r2 && g1 < g2) ? m : best;
  });
}

// ---------------------------------------------------------------------------
// standings
// ---------------------------------------------------------------------------

export interface Standing {
  /** One player (random partners), or a pair (fixed partners). */
  ids: string[];
  played: number;
  won: number;
  lost: number;
  /** Average length of the games they won, in seconds. */
  avgWinSeconds: number | null;
  /** Their own points across their two most recent losses. */
  lastTwoLossPoints: number | null;
  /** 1-based; entries that can't be separated at all share a rank. */
  rank: number;
  /** Level on wins and losses with a neighbour, so the tiebreak decided their order. */
  tied: boolean;
}

/** Lower is better; a missing value goes after a present one. */
const lowerFirst = (x: number | null, y: number | null) => (x === null ? (y === null ? 0 : 1) : y === null ? -1 : x - y);

/**
 * Ranked by most wins, then fewest losses. Entries level on both are separated by the session's
 * tiebreak, then the other one:
 *   win_time         lower average length of the games they won
 *   last_two_losses  lower total of their own points in their two most recent losses
 * Only finished games with a winner count.
 */
export function openPlayStandings(
  queue: Pick<SessionQueue, "players" | "games" | "partnerMode" | "tiebreak">,
): Standing[] {
  const { players, partnerMode, tiebreak } = queue;
  let units: string[][];
  if (partnerMode === "fixed") {
    const pairs = pairsOf(players);
    const paired = new Set(pairs.flat());
    units = [...pairs, ...players.filter((p) => !paired.has(p.id)).map((p) => [p.id])];
  } else {
    units = players.map((p) => [p.id]);
  }

  const finished = queue.games
    .filter((g) => gameWinner(g) !== null)
    .sort((x, y) => x.number - y.number);

  const rows = units.map((ids) => {
    let won = 0;
    let lost = 0;
    const winSeconds: number[] = [];
    const lossPoints: number[] = [];
    for (const g of finished) {
      const side = ids.every((id) => g.team1.includes(id)) ? 1 : ids.every((id) => g.team2.includes(id)) ? 2 : null;
      if (!side) continue;
      if (gameWinner(g) === side) {
        won++;
        const secs = gameSeconds(g);
        if (secs !== null) winSeconds.push(secs);
      } else {
        lost++;
        lossPoints.push((side === 1 ? g.score1 : g.score2) ?? 0);
      }
    }
    const lastTwo = lossPoints.slice(-2);
    return {
      ids,
      played: won + lost,
      won,
      lost,
      avgWinSeconds: winSeconds.length ? winSeconds.reduce((a, b) => a + b, 0) / winSeconds.length : null,
      lastTwoLossPoints: lastTwo.length ? lastTwo.reduce((a, b) => a + b, 0) : null,
    };
  });

  type Row = (typeof rows)[number];
  const metric: Record<Tiebreak, (r: Row) => number | null> = {
    win_time: (r) => r.avgWinSeconds,
    last_two_losses: (r) => r.lastTwoLossPoints,
  };
  const other: Tiebreak = tiebreak === "win_time" ? "last_two_losses" : "win_time";
  const sameRecord = (x: Row, y: Row) => x.won === y.won && x.lost === y.lost;
  const tiebreakOrder = (x: Row, y: Row) =>
    lowerFirst(metric[tiebreak](x), metric[tiebreak](y)) || lowerFirst(metric[other](x), metric[other](y));
  const order = new Map(units.map((u, i) => [u, i]));

  const sorted = [...rows].sort(
    (x, y) => y.won - x.won || x.lost - y.lost || tiebreakOrder(x, y) || order.get(x.ids)! - order.get(y.ids)!,
  );
  return sorted.map((r, i) => {
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    let rank = i + 1;
    // share the rank only when nothing at all separates them
    for (let j = i; j > 0 && sameRecord(sorted[j - 1], r) && tiebreakOrder(sorted[j - 1], r) === 0; j--) rank = j;
    return {
      ...r,
      rank,
      tied: r.played > 0 && ((!!prev && sameRecord(prev, r)) || (!!next && sameRecord(next, r))),
    };
  });
}
