import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { SessionCards } from "@/components/session-cards";
import { Skeleton, Tiles } from "@/components/ui";
import { getCourtConfig, getUpcomingSessions } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Open play",
  description: "Join a Danlex open play session: grab a spot, pay by QR and rotate through games with other players.",
};

export default function PlayPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <p className="text-sm font-bold text-accent">Open play</p>
      <h1 className="display mt-2 text-5xl">Join a session</h1>
      <p className="mt-3 max-w-2xl text-ink">
        Come alone or bring friends. Grab a spot, check in at the court and we rotate everyone through doubles games —
        whoever has sat out longest plays next.
      </p>
      <div className="mt-8">
        <Suspense
          fallback={
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-80" />
              <Skeleton className="h-80" />
              <Skeleton className="h-80" />
            </div>
          }
        >
          <Sessions />
        </Suspense>
      </div>
      <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Grab a spot", "Pick a session and tell us your level. Full? Join the waitlist."],
          ["Pay by QR", "We hold your spot for 15 minutes while you pay and upload the receipt."],
          ["Check in", "Show your code at the court and you're in the game queue."],
          ["Rotate & play", "Doubles games, mixed by level, until the session ends."],
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
  );
}

async function Sessions() {
  const [sessions, { settings }] = await Promise.all([getUpcomingSessions(), getCourtConfig()]);
  await connection();
  return <SessionCards sessions={sessions} currency={settings?.currency ?? "PHP"} now={new Date().getTime()} />;
}
