import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LiveBracket } from "@/components/bracket/live-bracket";
import { Podium } from "@/components/bracket/podium";
import { ticketClass } from "@/components/club";
import { Badge, cn, Skeleton } from "@/components/ui";
import { describeFormat, getPodium } from "@/lib/bracket";
import { toEngine } from "@/lib/bracket-db";
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
              "rounded-md border px-4 py-2 text-sm font-bold transition",
              x.id === division.id ? "border-fg bg-fg text-page" : "border-fg/40 text-ink hover:text-fg",
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
        <EntrantList divisionId={division.id} accent={division.kind === "singles" ? "electric" : "magenta"} />
      )}
    </>
  );
}

async function EntrantList({ divisionId, accent }: { divisionId: string; accent: "electric" | "magenta" }) {
  const entrants = await getPublicEntrants(divisionId);
  return (
    <div className={ticketClass(accent, "mt-8")}>
      <p className="display text-3xl text-pine-900">Draw not made yet</p>
      <p className="mt-2">
        The bracket is drawn at random once registration closes. {entrants.length} registered so far.
      </p>
      {entrants.length > 0 && (
        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          {entrants.map((e, i) => (
            <li key={e.id} className="flex items-center gap-3 rounded bg-pine-900/10 px-3 py-2">
              <span className="score w-6 text-pine-700">{i + 1}</span>
              <span className="font-semibold">{e.display_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
