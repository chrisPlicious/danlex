import Link from "next/link";
import { ticketClass, type TicketAccent } from "@/components/club";
import { buttonClass, cn, Tiles } from "@/components/ui";
import { bookingWhen, money } from "@/lib/format";
import { KIND_LABEL } from "@/lib/open-play";
import type { PublicSession } from "@/lib/types";

const ACCENT: Record<PublicSession["kind"], TicketAccent> = { open_play: "flame", beginner: "ball" };

/** What the join button says, given how full the session is. */
export function spotsLine(s: Pick<PublicSession, "spots_left" | "capacity" | "waitlist">): string {
  if (s.spots_left > 0) return `${s.spots_left} of ${s.capacity} spots left`;
  return s.waitlist > 0 ? `Full · ${s.waitlist} on the waitlist` : "Full · join the waitlist";
}

/** Upcoming open play sessions as cream tickets; each links to its join page. */
export function SessionCards({ sessions, currency, now }: { sessions: PublicSession[]; currency: string; now: number }) {
  if (sessions.length === 0) {
    return <p className="text-ink">No open play sessions are scheduled right now. Check back soon.</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sessions.map((s) => {
        const started = Date.parse(s.starts_at) <= now;
        const joinable = s.signups_open && !started;
        return (
          <article key={s.id} className={ticketClass(ACCENT[s.kind], "flex flex-col")}>
            <p className="text-sm font-bold">{KIND_LABEL[s.kind]}</p>
            <h3 className="display mt-1 text-3xl text-pine-900">{s.title}</h3>
            <p className="mt-2 font-bold">{bookingWhen(s.starts_at, s.ends_at)}</p>
            {s.level_note && <p className="mt-1 text-sm">{s.level_note}</p>}
            <div className="mt-4 flex items-end justify-between gap-3">
              <div className="on-board">
                <Tiles value={String(s.spots_left).padStart(2, "0")} />
              </div>
              <p className="text-right">
                <span className="score block text-3xl text-pine-900">{money(s.fee, currency)}</span>
                <span className="text-xs font-semibold">per player</span>
              </p>
            </div>
            <p className="mt-2 text-sm font-semibold">
              <span className="sr-only">{s.spots_left} spots left. </span>
              {started ? "Happening now" : spotsLine(s)}
            </p>
            <div className="mt-auto pt-5">
              <Link href={`/play/${s.id}`} className={cn(buttonClass("ticket", "lg"), "w-full")}>
                {started ? "See the queue" : !joinable ? "Sign-ups closed" : s.spots_left > 0 ? "Join" : "Join the waitlist"}
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}
