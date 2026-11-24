import type { Game, MatchStatus, Side, SlotIndex } from "@/lib/bracket";

export type TournamentStatus = "draft" | "open" | "closed" | "in_progress" | "completed";
export type DivisionKind = "singles" | "doubles";
export type RegistrationStatus = "confirmed" | "rejected" | "withdrawn";
export type BracketStatus = "draft" | "published" | "completed";

export interface Tournament {
  id: string;
  slug: string;
  name: string;
  event_date: string | null;
  venue: string | null;
  description: string | null;
  currency: string;
  payment_qr_path: string | null;
  payment_instructions: string | null;
  status: TournamentStatus;
}

export interface MatchFormatRow {
  games_to_win: number;
  points_to: number;
  win_by: number;
}

export interface Division {
  id: string;
  tournament_id: string;
  kind: DivisionKind;
  name: string;
  confirmed_count: number;
  fee: number | string; // postgres numeric arrives as string
  registration_open: boolean;
  match_format: MatchFormatRow;
  format: DivisionFormat;
  grand_final_reset: boolean;
  sort_order: number;
}

export type DivisionFormat = "double_elimination" | "round_robin";

export interface Registration {
  id: string;
  division_id: string;
  confirmation_code: string;
  status: RegistrationStatus;
  player1_name: string;
  player1_phone: string;
  player1_email: string;
  player2_name: string | null;
  player2_phone: string | null;
  player2_email: string | null;
  team_name: string | null;
  /** #rrggbb, shown as the background of the team's bracket cells */
  color: string | null;
  payment_proof_path: string | null;
  payment_ref: string | null;
  source: "online" | "admin";
  admin_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface BracketRow {
  id: string;
  division_id: string;
  status: BracketStatus;
  rng_seed: number;
  grand_final_reset: boolean;
  version: number;
  generated_at: string;
  published_at: string | null;
}

export interface MatchRow {
  id: string;
  bracket_id: string;
  code: string;
  side: Side;
  round: number;
  position: number;
  slot1_reg_id: string | null;
  slot1_bye: boolean;
  slot2_reg_id: string | null;
  slot2_bye: boolean;
  games: Game[];
  winner: SlotIndex | null;
  walkover: boolean;
  status: MatchStatus;
  winner_to_code: string | null;
  winner_to_slot: SlotIndex | null;
  loser_to_code: string | null;
  loser_to_slot: SlotIndex | null;
  court: string | null;
  scheduled_at: string | null;
}

export interface PublicEntrant {
  id: string;
  display_name: string;
  color: string | null;
}

// ---------------------------------------------------------------------------
// court rentals
// ---------------------------------------------------------------------------

export type BookingStatus = "held" | "confirmed" | "cancelled" | "expired";

/** Single row. Hours are court-local (Asia/Manila), close_hour is exclusive. */
export interface CourtSettings {
  bookings_open: boolean;
  open_hour: number;
  close_hour: number;
  max_hours: number;
  days_ahead: number;
  currency: string;
  payment_qr_path: string | null;
  payment_instructions: string | null;
}

/** A rental mode customers pick (Per Hour…). rate is per hour. Open play is a session, not a play type. */
export interface PlayType {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  rate: number | string; // postgres numeric arrives as string
  active: boolean;
  sort_order: number;
}

export interface Booking {
  id: string;
  /** Exactly one of play_type_id (a rental) and session_id (the court time of an open play session) is set. */
  play_type_id: string | null;
  session_id: string | null;
  status: BookingStatus;
  starts_at: string;
  ends_at: string;
  hold_expires_at: string | null;
  confirmation_code: string | null;
  name: string;
  phone: string;
  email: string | null;
  amount: number | string;
  payment_ref: string | null;
  payment_proof_path: string | null;
  source: "online" | "admin";
  admin_notes: string | null;
  created_at: string;
}

/** What the public sees of other bookings: just the taken time. */
export interface BusyInterval {
  starts_at: string;
  ends_at: string;
}

// ---------------------------------------------------------------------------
// open play sessions
// ---------------------------------------------------------------------------

export type SessionKind = "open_play" | "beginner";
export type SessionStatus = "scheduled" | "cancelled";
export type SignupStatus = "held" | "confirmed" | "waitlisted" | "offered" | "cancelled" | "expired";
/** Self-rated: 1 beginner, 2 intermediate, 3 advanced. */
export type Level = 1 | 2 | 3;

export interface Session {
  id: string;
  kind: SessionKind;
  title: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  fee: number | string;
  level_note: string | null;
  notes: string | null;
  signups_open: boolean;
  status: SessionStatus;
  version: number;
  created_at: string;
}

/** get_sessions_public: a session plus live counts, no player details. */
export interface PublicSession extends Omit<Session, "created_at"> {
  spots_left: number;
  waitlist: number;
}

export interface SessionSignup {
  id: string;
  session_id: string;
  code: string;
  status: SignupStatus;
  name: string;
  phone: string;
  email: string | null;
  level: Level;
  hold_token: string | null;
  hold_expires_at: string | null;
  offer_notified_at: string | null;
  amount: number | string;
  payment_ref: string | null;
  payment_proof_path: string | null;
  source: "online" | "admin";
  checked_in_at: string | null;
  queue_paused: boolean;
  refund_needed: boolean;
  refunded_at: string | null;
  cancelled_at: string | null;
  admin_notes: string | null;
  created_at: string;
}

export type GameStatus = "playing" | "done" | "void";

/** get_session_queue: confirmed players, first name + last initial only. */
export interface QueuePlayer {
  id: string;
  name: string;
  level: Level;
  checkedInAt: string | null;
  paused: boolean;
  lastEndedAt: string | null;
}

export interface QueueGame {
  id: string;
  number: number;
  status: Exclude<GameStatus, "void">;
  team1: [string, string];
  team2: [string, string];
  score1: number | null;
  score2: number | null;
  startedAt: string;
  endedAt: string | null;
}

export interface SessionQueue {
  players: QueuePlayer[];
  games: QueueGame[];
}

export const isAcceptingEntries =(t: Pick<Tournament, "status">, d: Division) =>
  t.status === "open" && d.registration_open;

export function displayName(r: Pick<Registration, "player1_name" | "player2_name" | "team_name">): string {
  if (r.team_name) return r.team_name;
  return r.player2_name ? `${r.player1_name} / ${r.player2_name}` : r.player1_name;
}
