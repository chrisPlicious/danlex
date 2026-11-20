"use client";

import { useCallback, useMemo, useState } from "react";
import { Badge, cn } from "@/components/ui";
import { useSessionVersion } from "@/components/use-session-version";
import { levelLabel, playerStates, rotationOrder, suggestNextGame } from "@/lib/open-play";
import { browserClient } from "@/lib/supabase/browser";
import type { QueueGame, SessionQueue } from "@/lib/types";

const TIME = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

/** Keeps a session's queue current: refetches whenever the session's version moves. */
export function useLiveQueue(sessionId: string, initial: SessionQueue) {
  const [queue, setQueue] = useState(initial);
  const reload = useCallback(() => {
    browserClient()
      .rpc("get_session_queue", { p_session_id: sessionId })
      .then(({ data }: { data: unknown }) => {
        if (data) setQueue(data as SessionQueue);
      });
  }, [sessionId]);
  useSessionVersion(sessionId, reload, 30_000);
  return queue;
}

export function Teams({ game, names, className }: { game: Pick<QueueGame, "team1" | "team2">; names: Map<string, string>; className?: string }) {
  const team = (ids: string[]) => ids.map((id) => names.get(id) ?? "Player").join(" & ");
  return (
    <div className={cn("grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr]", className)}>
      <p className="font-bold sm:text-right">{team(game.team1)}</p>
      <p className="score text-center text-ball">vs</p>
      <p className="font-bold">{team(game.team2)}</p>
    </div>
  );
}

/** Public, read-only view of the court: now playing, who's up next, the bench and results. */
export function QueueBoard({ sessionId, initial, ended }: { sessionId: string; initial: SessionQueue; ended?: boolean }) {
  const queue = useLiveQueue(sessionId, initial);
  const names = useMemo(() => new Map(queue.players.map((p) => [p.id, p.name])), [queue.players]);
  const states = useMemo(() => playerStates(queue.players, queue.games), [queue]);
  const order = useMemo(() => rotationOrder(states), [states]);
  const next = useMemo(() => suggestNextGame(queue.players, queue.games), [queue]);
  const playing = queue.games.find((g) => g.status === "playing");
  const done = queue.games.filter((g) => g.status === "done");
  const away = states.filter((s) => !s.player.checkedInAt);
  const resting = states.filter((s) => s.player.checkedInAt && s.player.paused && !s.onCourt);

  return (
    <div className="space-y-6">
      <section className="on-board rounded-md bg-board p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="display text-2xl">On court</h2>
          {playing && (
            <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-court">
              <span className="size-2 animate-pulse-live rounded-full bg-court" /> Game {playing.number}
            </span>
          )}
        </div>
        {playing ? (
          <>
            <Teams game={playing} names={names} className="text-xl" />
            <p className="mt-3 text-center text-xs text-ink">Started {TIME.format(new Date(playing.startedAt))}</p>
          </>
        ) : ended ? (
          <p className="text-ink">Session over. Thanks for playing!</p>
        ) : (
          <p className="text-ink">Court&apos;s free — next game starting soon.</p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={cn("rounded-md bg-panel p-5", ended && "hidden")}>
          <h2 className="display mb-1 text-2xl">Up next</h2>
          <p className="mb-4 text-xs text-ink">Fewest games first, then whoever has sat out longest. The organiser has the final say.</p>
          {next ? (
            <div className="rounded-md bg-well p-4">
              <Teams game={next} names={names} />
            </div>
          ) : (
            <p className="text-ink">Waiting for four players to be checked in and off court.</p>
          )}
          {order.length > 4 && (
            <ol className="mt-4 space-y-1 text-sm" start={5}>
              {order.slice(4).map((s, i) => (
                <li key={s.player.id} className="flex justify-between gap-3">
                  <span>
                    <span className="score mr-2 text-ink">{i + 5}</span>
                    {s.player.name}
                  </span>
                  <span className="text-ink">
                    {s.played} {s.played === 1 ? "game" : "games"}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="rounded-md bg-panel p-5">
          <h2 className="display mb-4 text-2xl">Players</h2>
          {states.length === 0 ? (
            <p className="text-ink">No confirmed players yet.</p>
          ) : (
            <ul className="divide-y divide-fg/10">
              {states.map((s) => (
                <li key={s.player.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className={cn("font-semibold", !s.player.checkedInAt && "text-ink")}>{s.player.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-ink">{levelLabel(s.player.level)}</span>
                    <span className="score text-sm">{s.played}</span>
                    {s.onCourt ? (
                      <Badge tone="court">On court</Badge>
                    ) : !s.player.checkedInAt ? (
                      <Badge>Not here yet</Badge>
                    ) : s.player.paused ? (
                      <Badge tone="ball">Resting</Badge>
                    ) : (
                      <Badge tone="electric">Waiting</Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {(away.length > 0 || resting.length > 0) && (
            <p className="mt-3 text-xs text-ink">
              {away.length} not checked in · {resting.length} resting
            </p>
          )}
        </section>
      </div>

      {done.length > 0 && (
        <section className="rounded-md bg-panel p-5">
          <h2 className="display mb-4 text-2xl">Results</h2>
          <ul className="divide-y divide-fg/10">
            {done.map((g) => (
              <li key={g.id} className="grid items-center gap-2 py-3 sm:grid-cols-[3rem_1fr_6rem]">
                <span className="score text-ink">#{g.number}</span>
                <Teams game={g} names={names} />
                <span className="score text-right text-xl">
                  {g.score1 !== null && g.score2 !== null ? `${g.score1}–${g.score2}` : "—"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
