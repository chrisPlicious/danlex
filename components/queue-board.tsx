"use client";

import { useCallback, useMemo, useState } from "react";
import { GameClock } from "@/components/game-clock";
import { OpenPlayStandings } from "@/components/open-play-standings";
import { Badge, cn } from "@/components/ui";
import { useSessionVersion } from "@/components/use-session-version";
import {
  clock,
  gameSeconds,
  levelLabel,
  pairRotation,
  partnerModeLabel,
  playerStates,
  rotationOrder,
  suggestNextGame,
} from "@/lib/open-play";
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
  const fixed = queue.partnerMode === "fixed";
  const states = useMemo(() => playerStates(queue.players, queue.games, queue.maxGames), [queue]);
  const order = useMemo(() => rotationOrder(states), [states]);
  const pairs = useMemo(() => pairRotation(states), [states]);
  const next = useMemo(
    () => suggestNextGame(queue.players, queue.games, { partnerMode: queue.partnerMode, maxGames: queue.maxGames }),
    [queue],
  );
  const playing = queue.games.find((g) => g.status === "playing");
  const done = queue.games.filter((g) => g.status === "done");
  const away = states.filter((s) => !s.player.checkedInAt);
  const resting = states.filter((s) => s.player.checkedInAt && s.player.paused && !s.onCourt);
  const first = (id: string) => (names.get(id) ?? "Player").split(" ")[0];

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
            <p className="mt-4 text-center">
              <GameClock startedAt={playing.startedAt} className="score text-4xl text-court" />
            </p>
            <p className="mt-1 text-center text-xs text-ink">Started {TIME.format(new Date(playing.startedAt))}</p>
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
          <p className="mb-4 text-xs text-ink">
            {partnerModeLabel(queue.partnerMode)} · up to {queue.maxGames} games each. Fewest games first, then whoever has sat
            out longest. The organiser has the final say.
          </p>
          {next ? (
            <div className="rounded-md bg-well p-4">
              <Teams game={next} names={names} />
            </div>
          ) : (
            <p className="text-ink">
              {fixed ? "Waiting for two pairs to be checked in and off court." : "Waiting for four players to be checked in and off court."}
            </p>
          )}
          {fixed
            ? pairs.length > 2 && (
                <ol className="mt-4 space-y-1 text-sm">
                  {pairs.slice(2).map((p, i) => (
                    <li key={p.join(":")}>
                      <span className="score mr-2 text-ink">{i + 3}</span>
                      {first(p[0])} &amp; {first(p[1])}
                    </li>
                  ))}
                </ol>
              )
            : order.length > 4 && (
                <ol className="mt-4 space-y-1 text-sm" start={5}>
                  {order.slice(4).map((s, i) => (
                    <li key={s.player.id} className="flex justify-between gap-3">
                      <span>
                        <span className="score mr-2 text-ink">{i + 5}</span>
                        {s.player.name}
                      </span>
                      <span className="text-ink">
                        {s.played}/{queue.maxGames} games
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
                    <span className="score text-sm">
                      {s.played}/{queue.maxGames}
                    </span>
                    {s.onCourt ? (
                      <Badge tone="court">On court</Badge>
                    ) : s.maxedOut ? (
                      <Badge>All games played</Badge>
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

      {queue.players.length > 0 && <OpenPlayStandings queue={queue} names={Object.fromEntries(names)} />}

      {done.length > 0 && (
        <section className="rounded-md bg-panel p-5">
          <h2 className="display mb-4 text-2xl">Results</h2>
          <ul className="divide-y divide-fg/10">
            {done.map((g) => {
              const secs = gameSeconds(g);
              return (
                <li key={g.id} className="grid items-center gap-2 py-3 sm:grid-cols-[3rem_1fr_6rem_4rem]">
                  <span className="score text-ink">#{g.number}</span>
                  <Teams game={g} names={names} />
                  <span className="score text-right text-xl">
                    {g.score1 !== null && g.score2 !== null ? `${g.score1}–${g.score2}` : "—"}
                  </span>
                  <span className="score text-right text-sm text-ink" title="Game time">
                    {secs === null ? "" : clock(secs)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
