import Link from "next/link";
import { ticketClass, type TicketAccent } from "@/components/club";
import { buttonClass, cn } from "@/components/ui";
import { money } from "@/lib/format";
import type { PlayType } from "@/lib/types";

// rental tickets alternate the stripe colours; electric/magenta stay with tournament divisions
const ACCENTS: TicketAccent[] = ["ball", "flame"];

/** Rental modes on the landing page as cream tickets; each links into /book with the mode preselected. */
export function PlayTypeCards({
  playTypes,
  currency,
  bookingsOpen,
}: {
  playTypes: PlayType[];
  currency: string;
  bookingsOpen: boolean;
}) {
  if (playTypes.length === 0) return <p className="text-ink">Court rental options will be posted soon.</p>;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {playTypes.map((p, i) => {
        const priced = Number(p.rate) > 0;
        return (
          <article key={p.id} className={ticketClass(ACCENTS[i % ACCENTS.length], "flex flex-col")}>
            <h3 className="display text-4xl text-pine-900">{p.name}</h3>
            {p.description && <p className="mt-2">{p.description}</p>}
            <p className="mt-4 flex items-baseline gap-2">
              {priced ? (
                <>
                  <span className="score text-4xl text-pine-900">{money(p.rate, currency)}</span>
                  <span className="text-sm font-semibold">per hour</span>
                </>
              ) : (
                <span className="text-sm font-semibold">Price coming soon</span>
              )}
            </p>
            <div className="mt-auto pt-5">
              {bookingsOpen && priced ? (
                <Link href={`/book?type=${p.slug}`} className={cn(buttonClass("ticket", "lg"), "w-full")}>
                  Book {p.name}
                </Link>
              ) : (
                <span className={cn(buttonClass("ticket", "lg"), "w-full cursor-not-allowed opacity-60")}>
                  {bookingsOpen ? "Not bookable yet" : "Bookings paused"}
                </span>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
