import Link from "next/link";
import { Suspense } from "react";
import { HeroLogo } from "@/components/brand";
import { StripeBend, Stripes } from "@/components/club";
import { DivisionCards } from "@/components/division-cards";
import { buttonClass, Skeleton, Tiles } from "@/components/ui";
import { eventDate } from "@/lib/format";
import { getActiveTournament } from "@/lib/queries";

export default function Home() {
  return (
    <>
      <section className="overflow-hidden">
        <div className="relative mx-auto grid max-w-6xl items-center gap-6 px-4 pt-6 pb-8 lg:grid-cols-[1.1fr_1fr] lg:gap-10 lg:pt-10 lg:pb-30">
          <StripeBend className="absolute bottom-0 left-[62%] hidden lg:block" />
          <div className="relative order-2 lg:order-1">
            <h1 className="display text-[2.75rem] text-balance min-[380px]:text-5xl sm:text-6xl lg:text-[4.25rem]">
              Leave it all on <span className="whitespace-nowrap">the court.</span>
              <br />
              Take the <span className="whitespace-nowrap">title home.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-ink">
              Double-elimination brackets for Singles and Doubles. Sign up, pay by QR, upload your receipt — you&apos;re
              in.
            </p>
            <Suspense fallback={<Skeleton className="mt-4 h-6 w-64" />}>
              <EventLine />
            </Suspense>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/register" className={buttonClass("primary", "lg")}>
                Register now
              </Link>
              <Link href="/bracket" className={buttonClass("secondary", "lg")}>
                View bracket
              </Link>
            </div>
          </div>
          <div className="relative order-1 lg:order-2 lg:-mb-16">
            <HeroLogo className="mx-auto w-full max-w-[22rem] lg:max-w-[26rem]" />
          </div>
        </div>
        <Stripes className="h-9 lg:hidden" />
      </section>

      <section id="divisions" className="bg-panel">
        <div className="mx-auto max-w-6xl px-4 py-10 md:py-14">
          <h2 className="display mb-6 text-4xl">Divisions</h2>
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
        </div>
      </section>

      <Stripes className="h-6" />

      <section>
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-2 md:py-14">
          <div>
            <h2 className="display text-4xl">How to join</h2>
            <ol className="mt-6 space-y-4">
              {[
                ["Pick a division", "Singles or Doubles. There's no limit, so everyone can join."],
                ["Pay by QR", "Scan the code, pay the entry fee, and enter the last 6 digits of your reference number."],
                ["Upload your receipt", "Your entry is confirmed the moment your screenshot is in."],
                ["Get drawn", "Everyone is placed into the bracket by random draw."],
              ].map(([title, body], i) => (
                <li key={title} className="flex items-start gap-4">
                  <Tiles value={String(i + 1)} />
                  <div>
                    <p className="font-bold">{title}</p>
                    <p className="text-ink">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h2 className="display text-4xl">The format</h2>
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
                <strong className="text-accent">Grand final:</strong> winners-bracket champ vs losers-bracket champ. If the
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
    <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 font-semibold">
      <span className="text-accent">{tournament.name}</span>
      {date && <span>{date}</span>}
      {tournament.venue && <span>{tournament.venue}</span>}
    </p>
  );
}

async function Divisions() {
  const data = await getActiveTournament();
  if (!data) return <p className="text-ink">No tournament is open right now. Check back soon.</p>;
  return <DivisionCards tournament={data.tournament} divisions={data.divisions} />;
}
