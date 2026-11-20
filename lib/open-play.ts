// Open play helpers shared by the public pages and admin. Pure, so they run on server and client.
import type { Level, QueueGame, QueuePlayer, SessionKind, SignupStatus } from "@/lib/types";

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
// game queue: who plays next on the one court
// ---------------------------------------------------------------------------

export interface PlayerState {
  player: QueuePlayer;
  /** Finished games. */
  played: number;
  onCourt: boolean;
  /** Checked in, not paused, not on court. */
  ready: boolean;
  /** When they last came off court, or checked in. Earlier means they've waited longer. */
  waitingSince: string | null;
}

export function playerStates(players: QueuePlayer[], games: QueueGame[]): PlayerState[] {
  const playing = new Set(games.filter((g) => g.status === "playing").flatMap((g) => [...g.team1, ...g.team2]));
  const played = new Map<string, number>();
  for (const g of games) {
    if (g.status !== "done") continue;
    for (const id of [...g.team1, ...g.team2]) played.set(id, (played.get(id) ?? 0) + 1);
  }
  return players.map((p) => {
    const onCourt = playing.has(p.id);
    return {
      player: p,
      played: played.get(p.id) ?? 0,
      onCourt,
      ready: !!p.checkedInAt && !p.paused && !onCourt,
      waitingSince: p.lastEndedAt ?? p.checkedInAt,
    };
  });
}

/** Fewest games first, then whoever has sat out longest, then check-in order. */
export function rotationOrder(states: PlayerState[]): PlayerState[] {
  const time = (s: PlayerState) => (s.waitingSince ? Date.parse(s.waitingSince) : Number.MAX_SAFE_INTEGER);
  return states
    .filter((s) => s.ready)
    .sort((a, b) => a.played - b.played || time(a) - time(b) || a.player.name.localeCompare(b.player.name));
}

export interface Matchup {
  team1: [string, string];
  team2: [string, string];
}

const samePair = (a: readonly string[], b: readonly string[]) => a.length === 2 && b.includes(a[0]) && b.includes(a[1]);

/**
 * Next four off the bench, split so the levels even out (strongest + weakest vs the middle two).
 * If that repeats a partnership from the last game, the other balanced split is used instead.
 */
export function suggestNextGame(players: QueuePlayer[], games: QueueGame[]): Matchup | null {
  const next = rotationOrder(playerStates(players, games)).slice(0, 4);
  if (next.length < 4) return null;
  const [a, b, c, d] = [...next].sort((x, y) => y.player.level - x.player.level).map((s) => s.player.id);

  const last = games.find((g) => g.status === "done");
  const repeats = (m: Matchup) =>
    !!last && [m.team1, m.team2].some((t) => samePair(t, last.team1) || samePair(t, last.team2));

  const balanced: Matchup = { team1: [a, d], team2: [b, c] };
  const alternative: Matchup = { team1: [a, c], team2: [b, d] };
  return repeats(balanced) && !repeats(alternative) ? alternative : balanced;
}
