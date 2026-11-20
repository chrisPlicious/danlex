"use client";

import { useEffect, useRef } from "react";
import { browserClient } from "@/lib/supabase/browser";

/**
 * Calls `onChange` whenever a session's version moves (any signup, game or edit), via Supabase
 * Realtime; sessions rows are public-readable. Also polls every `pollMs` as a fallback in case the
 * socket drops, which is common on phones that sleep.
 */
export function useSessionVersion(sessionId: string, onChange: () => void, pollMs = 60_000) {
  const callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  });

  useEffect(() => {
    const sb = browserClient();
    // supabase-js hands back an existing channel for a repeated name, and adding listeners to one that's
    // already subscribed throws; a fresh name per mount keeps two components (or a remount) apart
    const channel = sb
      .channel(`session:${sessionId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
        () => callback.current(),
      )
      .subscribe();
    const poll = setInterval(() => callback.current(), pollMs);
    const wake = () => document.visibilityState === "visible" && callback.current();
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", wake);
      sb.removeChannel(channel);
    };
  }, [sessionId, pollMs]);
}
