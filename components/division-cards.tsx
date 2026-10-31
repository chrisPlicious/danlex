"use client";

import Link from "next/link";
import { useLiveDivisions } from "@/components/use-live-divisions";
import { Badge, buttonClass, cn, SlotMeter } from "@/components/ui";
import { money } from "@/lib/format";
import { isAcceptingEntries, slotsLeft, type Division, type Tournament } from "@/lib/types";

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
        const full = slotsLeft(d) === 0;
        return (
          <article
            key={d.id}
            className={cn(
              "relative overflow-hidden rounded-2xl border bg-navy-900/80 p-5 sm:p-6",
              accent === "electric" ? "border-electric/40" : "border-magenta/40",
            )}
          >
            <div
              aria-hidden
              className={cn(
                "halftone pointer-events-none absolute -top-10 -right-10 size-44 rotate-12 rounded-3xl opacity-60",
                accent === "electric" ? "bg-electric/25" : "bg-magenta/25",
              )}
            />
            <div className="relative">
              <div className="flex items-center justify-between gap-3">
                <Badge tone={accent}>{d.kind === "singles" ? "1 player" : "2 players"}</Badge>
                <span className="text-sm font-bold text-chrome">{money(d.fee, tournament.currency)}</span>
              </div>
              <h3 className="display mt-3 text-4xl">{d.name}</h3>
              <div className="mt-5">
                <SlotMeter cap={d.slot_cap} taken={d.confirmed_count} accent={accent} />
              </div>
              <div className="mt-6">
                {open ? (
                  <Link href={`/register/${d.id}`} className={cn(buttonClass("primary", "lg"), "w-full")}>
                    Register {d.kind === "singles" ? "Singles" : "Doubles"}
                  </Link>
                ) : (
                  <span className={cn(buttonClass("secondary", "lg"), "w-full cursor-not-allowed opacity-60")}>
                    {full ? "Slots full" : "Registration closed"}
                  </span>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
