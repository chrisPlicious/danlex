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
  grand_final_reset: boolean;
  sort_order: number;
}

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

/** A rental mode customers pick (Beginner, Open Play, Per Hour…). rate is per hour. */
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
  play_type_id: string;
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

export const isAcceptingEntries = (t: Pick<Tournament, "status">, d: Division) =>
  t.status === "open" && d.registration_open;

export function displayName(r: Pick<Registration, "player1_name" | "player2_name" | "team_name">): string {
  if (r.team_name) return r.team_name;
  return r.player2_name ? `${r.player1_name} / ${r.player2_name}` : r.player1_name;
}
