import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { HeroLogo } from "@/components/brand";
import { StripeBend, Stripes } from "@/components/club";
import { DivisionCards } from "@/components/division-cards";
import { PlayTypeCards } from "@/components/play-type-cards";
import { SessionCards } from "@/components/session-cards";
import { Alert, buttonClass, Skeleton, Tiles } from "@/components/ui";
import { hourLabel } from "@/lib/court";
import { eventDate } from "@/lib/format";
import { getActiveTournament, getCourtConfig, getUpcomingSessions } from "@/lib/queries";

export default function Home() {
  return (
    <>
      <section className="overflow-hidden">
        <div className="relative mx-auto grid max-w-6xl items-center gap-6 px-4 pt-6 pb-8 lg:grid-cols-[1.1fr_1fr] lg:gap-10 lg:pt-10 lg:pb-30">
          <StripeBend className="absolute bottom-0 left-[62%] hidden lg:block" />
          <div className="relative order-2 lg:order-1">
            <h1 className="display text-[2.75rem] text-balance min-[380px]:text-5xl sm:text-6xl lg:text-[4.25rem]">
              Book the <span className="whitespace-nowrap">court.</span>
              <br />
              Take the <span className="whitespace-nowrap">title home.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-ink">
              Rent the court by the hour, join an open play session to meet other players, or sign up for the next
              double-elimination tournament.
            </p>
            <Suspense fallback={<Skeleton className="mt-4 h-6 w-64" />}>
              <HoursLine />
            </Suspense>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/book" className={buttonClass("primary", "lg")}>
                Book the court
              </Link>
              <Link href="/play" className={buttonClass("secondary", "lg")}>
                Open play
              </Link>
            </div>
          </div>
          <div className="relative order-1 lg:order-2 lg:-mb-16">
            <HeroLogo className="mx-auto w-full max-w-[22rem] lg:max-w-[26rem]" />
          </div>
        </div>
        <Stripes className="h-9 lg:hidden" />
      </section>

      <section id="court" className="scroll-mt-14 bg-panel">
        <div className="mx-auto max-w-6xl px-4 py-10 md:py-14">
          <p className="text-sm font-bold text-accent">Court rental</p>
          <h2 className="display mt-1 text-4xl">Rent the court</h2>
          <p className="mt-3 max-w-2xl text-ink">
            Pick how you want to play, choose your hours, pay by QR and upload your receipt. Your time is locked the
            moment your screenshot is in.
          </p>
          <div className="mt-6">
            <Suspense
              fallback={
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Skeleton className="h-72" />
                  <Skeleton className="h-72" />
                  <Skeleton className="h-72" />
                </div>
              }
            >
              <CourtOptions />
            </Suspense>
          </div>
          <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Pick a play type", "The whole court to yourself: practice, drills or a private match."],
              ["Choose your hours", "Free times show live. We hold yours for 15 minutes."],
              ["Pay by QR", "Pay the exact amount and enter the last 6 digits of your reference number."],
              ["Show your code", "Upload the receipt and you're booked."],
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
      </section>

      <section id="open-play" className="scroll-mt-14">
        <div className="mx-auto max-w-6xl px-4 py-10 md:py-14">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-accent">Open play</p>
              <h2 className="display mt-1 text-4xl">Play with the club</h2>
              <p className="mt-3 max-w-2xl text-ink">
                No group? No problem. Grab a spot in a session, check in at the court and rotate through doubles games
                with players at your level.
              </p>
            </div>
            <Link href="/play" className={buttonClass("secondary")}>
              All sessions
            </Link>
          </div>
          <div className="mt-6">
            <Suspense
              fallback={
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Skeleton className="h-80" />
                  <Skeleton className="h-80" />
                  <Skeleton className="h-80" />
                </div>
              }
            >
              <OpenPlay />
            </Suspense>
          </div>
        </div>
      </section>

      <Stripes className="h-6" />

      <section id="tournament" className="scroll-mt-14">
        <div className="mx-auto max-w-6xl px-4 py-10 md:py-14">
          <p className="text-sm font-bold text-accent">Tournament</p>
          <Suspense fallback={<Skeleton className="mt-2 h-24 w-full max-w-xl" />}>
            <TournamentHeader />
          </Suspense>
          <div className="mt-6">
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
        </div>
      </section>

      <section className="bg-panel">
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

async function HoursLine() {
  const { settings } = await getCourtConfig();
  if (!settings) return null;
  return (
    <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 font-semibold">
      <span className="text-accent">{settings.bookings_open ? "Open for bookings" : "Bookings paused"}</span>
      <span>
        Daily {hourLabel(settings.open_hour)} – {hourLabel(settings.close_hour)}
      </span>
    </p>
  );
}

async function CourtOptions() {
  const { settings, playTypes } = await getCourtConfig();
  const open = settings?.bookings_open ?? false;
  return (
    <div className="space-y-4">
      {!open && <Alert tone="ball">Court bookings are paused right now. Check back soon.</Alert>}
      <PlayTypeCards playTypes={playTypes} currency={settings?.currency ?? "PHP"} bookingsOpen={open} />
    </div>
  );
}

async function OpenPlay() {
  const [sessions, { settings }] = await Promise.all([getUpcomingSessions(), getCourtConfig()]);
  await connection();
  return <SessionCards sessions={sessions.slice(0, 3)} currency={settings?.currency ?? "PHP"} now={new Date().getTime()} />;
}

async function TournamentHeader() {
  const data = await getActiveTournament();
  if (!data) {
    return (
      <>
        <h2 className="display mt-1 text-4xl">Tournaments</h2>
        <p className="mt-3 text-ink">No tournament is open right now. Check back soon.</p>
      </>
    );
  }
  const { tournament } = data;
  const date = eventDate(tournament.event_date);
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <h2 className="display mt-1 text-4xl">{tournament.name}</h2>
        <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-semibold">
          <span className="text-accent">Double elimination</span>
          {date && <span>{date}</span>}
          {tournament.venue && <span>{tournament.venue}</span>}
        </p>
        {date && <p className="mt-1 text-sm text-ink">The court is closed to rentals on tournament day.</p>}
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/register" className={buttonClass("primary")}>
          Register
        </Link>
        <Link href="/bracket" className={buttonClass("secondary")}>
          View bracket
        </Link>
      </div>
    </div>
  );
}

async function Divisions() {
  const data = await getActiveTournament();
  if (!data) return null;
  return <DivisionCards tournament={data.tournament} divisions={data.divisions} />;
}
