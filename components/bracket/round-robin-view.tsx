"use client";

import { useMemo } from "react";
import { CARD_H, MatchCard, type MatchMeta } from "@/components/bracket/bracket-view";
import { cn } from "@/components/ui";
import { pointDiff, roundRobinStandings, type BracketMatch } from "@/lib/bracket";
import { textOn } from "@/lib/team-color";

const NO_HINTS = new Map<string, string>();

/** Round robin: standings table plus every game in play order. */
export function RoundRobinView({
  matches,
  names,
  colors = {},
  meta = {},
  selected,
  onSelect,
}: {
  matches: BracketMatch[];
  names: Record<string, string>;
  colors?: Record<string, string>;
  meta?: Record<string, MatchMeta>;
  selected?: string | null;
  onSelect?: (code: string) => void;
}) {
  const games = useMemo(() => [...matches].sort((a, b) => a.round - b.round), [matches]);
  const standings = useMemo(() => roundRobinStandings(matches), [matches]);
  const played = games.filter((m) => m.status === "completed").length;

  return (
    <div className="space-y-8">
      <section className="rounded-md border-t-[10px] border-t-electric bg-panel">
        <h3 className="display px-4 pt-4 text-2xl">Standings</h3>
        <div className="overflow-x-auto p-4">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs font-bold tracking-wider text-ink uppercase">
                <th className="w-8 pb-2 font-bold">#</th>
                <th className="pb-2 font-bold">Team</th>
                <th className="w-10 pb-2 text-center font-bold" title="Played">P</th>
                <th className="w-10 pb-2 text-center font-bold" title="Won">W</th>
                <th className="w-10 pb-2 text-center font-bold" title="Lost">L</th>
                <th className="w-12 pb-2 text-right font-bold" title="Point difference">+/−</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => {
                const color = colors[s.entrantId];
                const diff = pointDiff(s);
                return (
                  <tr key={s.entrantId} className="border-t border-fg/10">
                    <td className="score py-2 text-ink">{i + 1}</td>
                    <td className="py-2 pr-2">
                      <span
                        className={cn("inline-block max-w-full truncate rounded px-2 py-1 font-semibold", !color && "px-0")}
                        style={color ? { backgroundColor: color, color: textOn(color) } : undefined}
                      >
                        {names[s.entrantId] ?? "Unknown"}
                      </span>
                    </td>
                    <td className="score py-2 text-center text-ink">{s.played}</td>
                    <td className="score py-2 text-center font-bold">{s.won}</td>
                    <td className="score py-2 text-center">{s.lost}</td>
                    <td className="score py-2 text-right text-ink">{diff > 0 ? `+${diff}` : diff}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-ink">
            Ranked by wins, then head-to-head when two teams are level, then point difference.
          </p>
        </div>
      </section>

      <section className="rounded-md border-t-[10px] border-t-magenta bg-panel">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
          <h3 className="display text-2xl">Games</h3>
          <p className="text-sm text-ink">
            {played} of {games.length} played
          </p>
        </div>
        <ol className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((m) => (
            <li key={m.code}>
              <MatchCard
                m={m}
                names={names}
                colors={colors}
                meta={meta[m.code]}
                hints={NO_HINTS}
                selected={selected === m.code}
                onSelect={onSelect}
                className="relative w-full"
                style={{ height: CARD_H }}
              />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
