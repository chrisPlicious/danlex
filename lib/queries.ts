import "server-only";
import { connection } from "next/server";
import { createPublicClient, createSessionClient } from "@/lib/supabase/server";
import { supabaseUrl } from "@/lib/env";
import type { BracketRow, Division, MatchRow, PublicEntrant, Tournament } from "@/lib/types";

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
    sb.rpc("get_public_entrants", { p_division_id: divisionId }).returns<PublicEntrant[]>(),
  ]);
  if (mErr) throw mErr;
  if (eErr) throw eErr;
  return {
    bracket,
    matches: matches ?? [],
    entrants: Object.fromEntries((entrants ?? []).map((e) => [e.id, e.display_name])),
  };
}

/** Published bracket for the public view (RLS hides drafts). */
export async function getPublicBracket(divisionId: string) {
  await connection();
  return loadBracket(createPublicClient(), divisionId);
}

export async function getAdminBracket(divisionId: string) {
  return loadBracket(await createSessionClient(), divisionId);
}

export async function getPublicEntrants(divisionId: string): Promise<PublicEntrant[]> {
  await connection();
  const { data, error } = await createPublicClient()
    .rpc("get_public_entrants", { p_division_id: divisionId })
    .returns<PublicEntrant[]>();
  if (error) throw error;
  return data ?? [];
}
