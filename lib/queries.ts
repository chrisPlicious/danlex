import "server-only";
import { connection } from "next/server";
import { createPublicClient, createSessionClient } from "@/lib/supabase/server";
import { supabaseUrl } from "@/lib/env";
import type {
  BracketRow,
  BusyInterval,
  CourtSettings,
  Division,
  MatchRow,
  PlayType,
  PublicEntrant,
  PublicSession,
  SessionQueue,
  Tournament,
} from "@/lib/types";

export interface TournamentWithDivisions {
  tournament: Tournament;
  divisions: Division[];
}

type Client = ReturnType<typeof createPublicClient> | Awaited<ReturnType<typeof createSessionClient>>;

async function loadTournament(sb: Client, includeDrafts: boolean): Promise<TournamentWithDivisions | null> {
  let q = sb.from("tournaments").select("*");
  if (!includeDrafts) q = q.neq("status", "draft");
  const { data: tournament, error } = await q
    .order("event_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Tournament>();
  if (error) throw error;
  if (!tournament) return null;

  const { data: divisions, error: dErr } = await sb
    .from("divisions")
    .select("*")
    .eq("tournament_id", tournament.id)
    .order("sort_order")
    .order("name")
    .returns<Division[]>();
  if (dErr) throw dErr;
  return { tournament, divisions: divisions ?? [] };
}

/** The tournament shown on the public site (latest non-draft). */
export async function getActiveTournament() {
  await connection();
  return loadTournament(createPublicClient(), false);
}

/** Same, but as the signed-in admin (drafts included). */
export async function getAdminTournament() {
  return loadTournament(await createSessionClient(), true);
}

export function publicAssetUrl(path: string | null): string | null {
  return path ? `${supabaseUrl()}/storage/v1/object/public/public-assets/${path}` : null;
}

export const QR_PLACEHOLDER = "/brand/qr-placeholder.svg";

export interface BracketBundle {
  bracket: BracketRow;
  matches: MatchRow[];
  entrants: Record<string, string>;
  /** entrant id → team colour, only for entrants that have one */
  colors: Record<string, string>;
}

async function loadBracket(sb: Client, divisionId: string): Promise<BracketBundle | null> {
  const { data: bracket, error } = await sb
    .from("brackets")
    .select("*")
    .eq("division_id", divisionId)
    .maybeSingle<BracketRow>();
  if (error) throw error;
  if (!bracket) return null;

  const [{ data: matches, error: mErr }, { data: entrants, error: eErr }] = await Promise.all([
    sb.from("matches").select("*").eq("bracket_id", bracket.id).returns<MatchRow[]>(),
    sb.rpc("get_public_entrants", { p_division_id: divisionId }),
  ]);
  if (mErr) throw mErr;
  if (eErr) throw eErr;
  const list = (entrants ?? []) as PublicEntrant[];
  return {
    bracket,
    matches: matches ?? [],
    entrants: Object.fromEntries(list.map((e) => [e.id, e.display_name])),
    colors: Object.fromEntries(list.flatMap((e) => (e.color ? [[e.id, e.color]] : []))),
  };
}

/** Published bracket for the public view (RLS hides drafts). One with no match rows has nothing to show. */
export async function getPublicBracket(divisionId: string) {
  await connection();
  const bundle = await loadBracket(createPublicClient(), divisionId);
  return bundle?.matches.length ? bundle : null;
}

export async function getAdminBracket(divisionId: string) {
  return loadBracket(await createSessionClient(), divisionId);
}

export async function getPublicEntrants(divisionId: string): Promise<PublicEntrant[]> {
  await connection();
  const { data, error } = await createPublicClient().rpc("get_public_entrants", { p_division_id: divisionId });
  if (error) throw error;
  return (data ?? []) as PublicEntrant[];
}

// ---------------------------------------------------------------------------
// court rentals
// ---------------------------------------------------------------------------

export interface CourtConfig {
  settings: CourtSettings | null;
  playTypes: PlayType[];
}

async function loadCourtConfig(sb: Client, includeInactive: boolean): Promise<CourtConfig> {
  let types = sb.from("play_types").select("*");
  if (!includeInactive) types = types.eq("active", true);
  const [{ data: settings, error }, { data: playTypes, error: pErr }] = await Promise.all([
    sb.from("court_settings").select("*").maybeSingle<CourtSettings>(),
    types.order("sort_order").order("name").returns<PlayType[]>(),
  ]);
  if (error) throw error;
  if (pErr) throw pErr;
  return { settings, playTypes: playTypes ?? [] };
}

/** Booking rules and the active play types, for the public booking page. */
export async function getCourtConfig() {
  await connection();
  return loadCourtConfig(createPublicClient(), false);
}

/** Same, as the signed-in admin (retired play types included). */
export async function getAdminCourtConfig() {
  return loadCourtConfig(await createSessionClient(), true);
}

/** Dates of announced (non-draft) tournaments; the court is closed to rentals on these days. */
export async function getTournamentDays(): Promise<string[]> {
  await connection();
  const { data, error } = await createPublicClient()
    .from("tournaments")
    .select("event_date")
    .neq("status", "draft")
    .not("event_date", "is", null)
    .returns<{ event_date: string }[]>();
  if (error) throw error;
  return [...new Set((data ?? []).map((t) => t.event_date))];
}

// ---------------------------------------------------------------------------
// open play sessions
// ---------------------------------------------------------------------------

/** Scheduled sessions that haven't ended, soonest first, with live spot counts. */
export async function getUpcomingSessions(): Promise<PublicSession[]> {
  await connection();
  const { data, error } = await createPublicClient().rpc("get_sessions_public", {});
  if (error) throw error;
  return (data ?? []) as PublicSession[];
}

/** One session by id, cancelled or past included. */
export async function getPublicSession(id: string): Promise<PublicSession | null> {
  await connection();
  const { data, error } = await createPublicClient().rpc("get_sessions_public", { p_session_id: id });
  if (error) throw error;
  return ((data ?? []) as PublicSession[])[0] ?? null;
}

/** Confirmed players (first name + last initial) and games, for the queue board. */
export async function getSessionQueue(id: string): Promise<SessionQueue> {
  await connection();
  const { data, error } = await createPublicClient().rpc("get_session_queue", { p_session_id: id });
  if (error) throw error;
  return (data ?? { partnerMode: "random", tiebreak: "win_time", maxGames: 5, players: [], games: [] }) as SessionQueue;
}

/** Taken hours on a court-local day (YYYY-MM-DD): confirmed bookings and live holds, no names. */
export async function getCourtBusy(day: string): Promise<BusyInterval[]> {
  await connection();
  const { data, error } = await createPublicClient().rpc("get_court_busy", { p_day: day });
  if (error) throw error;
  return (data ?? []) as BusyInterval[];
}
