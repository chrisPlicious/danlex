"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase/browser";
import type { Division } from "@/lib/types";

/** Keeps slot counters current via Supabase Realtime (divisions rows are public-readable). */
export function useLiveDivisions(initial: Division[]): Division[] {
  const [divisions, setDivisions] = useState(initial);
  const tournamentId = initial[0]?.tournament_id;

  useEffect(() => {
    if (!tournamentId) return;
    const sb = browserClient();
    const channel = sb
      .channel(`divisions:${tournamentId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "divisions", filter: `tournament_id=eq.${tournamentId}` },
        (payload) => {
          const next = payload.new as Division;
          setDivisions((prev) => prev.map((d) => (d.id === next.id ? { ...d, ...next } : d)));
        },
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [tournamentId]);

  return divisions;
}
