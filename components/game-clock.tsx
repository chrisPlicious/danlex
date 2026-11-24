"use client";

import { useEffect, useState } from "react";
import { clock } from "@/lib/open-play";

/** Running time of the game on court, from when it was started. */
export function GameClock({ startedAt, className }: { startedAt: string; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className={className} suppressHydrationWarning aria-label="Game time">
      {clock((now - Date.parse(startedAt)) / 1000)}
    </span>
  );
}
