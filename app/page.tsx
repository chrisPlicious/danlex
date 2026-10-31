import Link from "next/link";
import { Suspense } from "react";
import { HeroLogo } from "@/components/brand";
import { DivisionCards } from "@/components/division-cards";
import { buttonClass, Skeleton } from "@/components/ui";
import { eventDate } from "@/lib/format";
import { getActiveTournament } from "@/lib/queries";

export default function Home() {
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-10 pb-16 md:grid-cols-[1.1fr_1fr] md:pt-16">
        <div className="order-2 md:order-1">
          <p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-electric-soft">Tournament registration</p>
          <h1 className="display text-6xl sm:text-7xl">
            <span className="text-flame">Play twice.</span>
            <br />
            <span className="text-chrome">Lose twice to go home.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-ink">
            Double-elimination brackets for Singles and Doubles. Grab a slot, pay by QR, upload your receipt —
            you&apos;re in.
          </p>
          <Suspense fallback={<Skeleton className="mt-6 h-6 w-64" />}>
            <EventLine />
          </Suspense>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className={buttonClass("primary", "lg")}>
              Register now
            </Link>
            <Link href="/bracket" className={buttonClass("secondary", "lg")}>
              View bracket
            </Link>
          </div>
        </div>
        <div className="order-1 md:order-2">
          <HeroLogo />
        </div>
      </section>

      <section id="divisions" className="mx-auto max-w-6xl px-4 pb-16">
        <h2 className="display mb-6 text-3xl">Divisions</h2>
        <Suspense
          fallback={
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-72" />
              <Skeleton className="h-72" />
            </div>
          }
        >
          <Divisions />
        </Suspense>
      </section>

      <section className="border-y border-white/5 bg-navy-900/50">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-2">
          <div>
            <h2 className="display text-3xl">How to join</h2>
            <ol className="mt-6 space-y-4">
              {[
                ["Pick a division", "Singles or Doubles. Slots are first come, first served."],
                ["Pay by QR", "Scan the code and pay the entry fee."],
                ["Upload your receipt", "Your slot locks the moment your screenshot is in."],
                ["Get drawn", "Everyone is placed into the bracket by random draw."],
              ].map(([title, body], i) => (
                <li key={title} className="flex gap-4">
                  <span className="display grid size-10 shrink-0 place-items-center rounded-lg bg-ball text-xl text-navy-950">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-bold text-chrome">{title}</p>
                    <p className="text-ink">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h2 className="display text-3xl">The format</h2>
            <div className="mt-6 space-y-4 text-ink">
              <p>
                <strong className="text-electric-soft">Winners bracket:</strong> win and keep climbing. Lose once and
                you drop down — you&apos;re not out yet.
              </p>
              <p>
                <strong className="text-magenta-soft">Losers bracket:</strong> one more loss here and your run ends. The
                last one standing earns a shot at the title.
              </p>
              <p>
                <strong className="text-ball">Grand final:</strong> winners-bracket champ vs losers-bracket champ. If the
                challenger wins, it&apos;s one loss each — a reset match decides the title.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

async function EventLine() {
  const data = await getActiveTournament();
  if (!data) return null;
  const { tournament } = data;
  const date = eventDate(tournament.event_date);
  return (
    <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold text-chrome">
      <span className="text-ball">{tournament.name}</span>
      {date && <span className="text-ink">· {date}</span>}
      {tournament.venue && <span className="text-ink">· {tournament.venue}</span>}
    </p>
  );
}

async function Divisions() {
  const data = await getActiveTournament();
  if (!data) return <p className="text-ink">No tournament is open right now. Check back soon.</p>;
  return <DivisionCards tournament={data.tournament} divisions={data.divisions} />;
}
