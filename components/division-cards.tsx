"use client";

import Link from "next/link";
import { ticketClass } from "@/components/club";
import { useLiveDivisions } from "@/components/use-live-divisions";
import { buttonClass, cn, EntryCount } from "@/components/ui";
import { isAcceptingEntries, type Division, type Tournament } from "@/lib/types";

export function DivisionCards({ tournament, divisions: initial }: { tournament: Tournament; divisions: Division[] }) {
  const divisions = useLiveDivisions(initial);

  if (divisions.length === 0) {
    return <p className="text-ink">Divisions will be announced soon.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {divisions.map((d) => {
        const accent = d.kind === "singles" ? "electric" : "magenta";
        const open = isAcceptingEntries(tournament, d);
        return (
          <article key={d.id} className={ticketClass(accent, "flex flex-col")}>
            <h3 className="display text-4xl text-pine-900">{d.name}</h3>
            <div className="mt-4">
              <EntryCount count={d.confirmed_count} kind={d.kind} />
            </div>
            <div className="mt-auto pt-5">
              {open ? (
                <Link href={`/register/${d.id}`} className={cn(buttonClass("ticket", "lg"), "w-full")}>
                  Register {d.kind === "singles" ? "Singles" : "Doubles"}
                </Link>
              ) : (
                <span className={cn(buttonClass("ticket", "lg"), "w-full cursor-not-allowed opacity-60")}>
                  Registration closed
                </span>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
