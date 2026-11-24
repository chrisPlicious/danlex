import { cn } from "@/components/ui";
import { clock, openPlayStandings, tiebreakLabel } from "@/lib/open-play";
import type { SessionQueue } from "@/lib/types";

/** Open play table: wins and losses per player (or per pair), with both tiebreak values shown. */
export function OpenPlayStandings({
  queue,
  names,
  className,
}: {
  queue: Pick<SessionQueue, "players" | "games" | "partnerMode" | "tiebreak">;
  names: Record<string, string>;
  className?: string;
}) {
  const rows = openPlayStandings(queue);
  const fixed = queue.partnerMode === "fixed";
  const other = queue.tiebreak === "win_time" ? "last_two_losses" : "win_time";
  const head = (active: boolean) => cn("pb-2 text-right font-bold", active ? "text-fg" : "text-ink");

  return (
    <section className={cn("rounded-md border-t-[10px] border-t-electric bg-panel", className)}>
      <h2 className="display px-5 pt-4 text-2xl">Standings</h2>
      <div className="overflow-x-auto p-5 pt-3">
        {rows.length === 0 ? (
          <p className="text-ink">No players yet.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs font-bold tracking-wider text-ink uppercase">
                <th className="w-8 pb-2 font-bold">#</th>
                <th className="pb-2 font-bold">{fixed ? "Pair" : "Player"}</th>
                <th className="w-9 pb-2 text-center font-bold" title="Played">P</th>
                <th className="w-9 pb-2 text-center font-bold" title="Won">W</th>
                <th className="w-9 pb-2 text-center font-bold" title="Lost">L</th>
                <th className={cn("w-20", head(queue.tiebreak === "win_time"))} title="Average time of the games they won">
                  Avg win
                </th>
                <th
                  className={cn("w-20", head(queue.tiebreak === "last_two_losses"))}
                  title="Their own points in their two most recent losses"
                >
                  Last 2 L
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ids.join("+")} className="border-t border-fg/10">
                  <td className="score py-2 text-ink">{r.rank}</td>
                  <td className="py-2 pr-2 font-semibold">
                    {r.ids.map((id) => names[id] ?? "Player").join(" & ")}
                    {r.tied && (
                      <span className="ml-2 rounded bg-ball/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-fg" title="Level on wins and losses: placed by the tiebreak">
                        TB
                      </span>
                    )}
                  </td>
                  <td className="score py-2 text-center text-ink">{r.played}</td>
                  <td className="score py-2 text-center font-bold">{r.won}</td>
                  <td className="score py-2 text-center">{r.lost}</td>
                  <td className={cn("score py-2 text-right", queue.tiebreak !== "win_time" && "text-ink")}>
                    {r.avgWinSeconds === null ? "—" : clock(r.avgWinSeconds)}
                  </td>
                  <td className={cn("score py-2 text-right", queue.tiebreak !== "last_two_losses" && "text-ink")}>
                    {r.lastTwoLossPoints ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-ink">
          {fixed ? "Pairs" : "Players"} are ranked by wins, then fewest losses. Level on both? {tiebreakLabel(queue.tiebreak)}{" "}
          decides (lower is better), then {tiebreakLabel(other).toLowerCase()}.
        </p>
      </div>
    </section>
  );
}
