import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LiveBracket } from "@/components/bracket/live-bracket";
import { Podium } from "@/components/bracket/podium";
import { Badge, cn, Skeleton } from "@/components/ui";
import { getPodium } from "@/lib/bracket";
import { toEngine } from "@/lib/bracket-db";
import { describeFormat } from "@/lib/bracket";
import { getActiveTournament, getPublicBracket, getPublicEntrants } from "@/lib/queries";

export const metadata: Metadata = { title: "Bracket" };

export default function BracketPage({ searchParams }: PageProps<"/bracket">) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="display text-5xl">Bracket</h1>
      <p className="mt-2 text-ink">Double elimination · updates live as scores come in.</p>
      <Suspense fallback={<Skeleton className="mt-8 h-[30rem]" />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/bracket">["searchParams"] }) {
  const { d } = await searchParams;
  const data = await getActiveTournament();
  if (!data || data.divisions.length === 0) {
    return <p className="mt-8 text-ink">No tournament brackets yet.</p>;
  }
  const division = data.divisions.find((x) => x.id === d) ?? data.divisions[0];
  const bundle = await getPublicBracket(division.id);

  return (
    <>
      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Divisions">
        {data.divisions.map((x) => (
          <Link
            key={x.id}
            href={`/bracket?d=${x.id}`}
            aria-current={x.id === division.id ? "page" : undefined}
            className={cn(
              "rounded-lg border px-4 py-2 text-sm font-bold transition",
              x.id === division.id
                ? x.kind === "singles"
                  ? "border-electric bg-electric/20 text-chrome"
                  : "border-magenta bg-magenta/20 text-chrome"
                : "border-white/10 text-ink hover:text-chrome",
            )}
          >
            {x.name}
          </Link>
        ))}
      </nav>

      {bundle ? (
        <div className="mt-8 space-y-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={bundle.bracket.status === "completed" ? "court" : "ball"}>
              {bundle.bracket.status === "completed" ? "Final" : "In progress"}
            </Badge>
            <span className="text-sm text-ink">
              {describeFormat({
                gamesToWin: division.match_format.games_to_win,
                pointsTo: division.match_format.points_to,
                winBy: division.match_format.win_by,
              })}
            </span>
          </div>
          <Podium podium={getPodium(toEngine(bundle.bracket.grand_final_reset, bundle.matches))} names={bundle.entrants} />
          <LiveBracket bracketId={bundle.bracket.id} rows={bundle.matches} names={bundle.entrants} />
        </div>
      ) : (
        <EntrantList divisionId={division.id} cap={division.slot_cap} />
      )}
    </>
  );
}

async function EntrantList({ divisionId, cap }: { divisionId: string; cap: number }) {
  const entrants = await getPublicEntrants(divisionId);
  return (
    <div className="mt-8 rounded-2xl border border-white/10 bg-navy-900/70 p-6">
      <p className="display text-2xl">Draw not made yet</p>
      <p className="mt-1 text-ink">
        The bracket is drawn at random once registration closes. {entrants.length} of {cap} slots filled.
      </p>
      {entrants.length > 0 && (
        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          {entrants.map((e, i) => (
            <li key={e.id} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
              <span className="display w-6 text-ball">{i + 1}</span>
              <span className="font-semibold">{e.display_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
