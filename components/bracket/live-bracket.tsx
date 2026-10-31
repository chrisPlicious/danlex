"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { BracketView, type MatchMeta } from "@/components/bracket/bracket-view";
import { rowToMatch, sortMatches } from "@/lib/bracket-db";
import { browserClient } from "@/lib/supabase/browser";
import type { MatchRow } from "@/lib/types";

/** Public bracket: re-renders from the server whenever a match row changes. */
export function LiveBracket({
  bracketId,
  rows,
  names,
}: {
  bracketId: string;
  rows: MatchRow[];
  names: Record<string, string>;
}) {
  const router = useRouter();
  const matches = useMemo(() => sortMatches(rows.map(rowToMatch)), [rows]);
  const meta = useMemo(
    () => Object.fromEntries(rows.map((r) => [r.code, { court: r.court, scheduled_at: r.scheduled_at } satisfies MatchMeta])),
    [rows],
  );

  useEffect(() => {
    const sb = browserClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };
    const channel = sb
      .channel(`bracket:${bracketId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `bracket_id=eq.${bracketId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "brackets", filter: `id=eq.${bracketId}` }, refresh)
      .subscribe();
    return () => {
      clearTimeout(timer);
      sb.removeChannel(channel);
    };
  }, [bracketId, router]);

  return <BracketView matches={matches} names={names} meta={meta} />;
}
