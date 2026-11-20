import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { QueueBoard } from "@/components/queue-board";
import { Alert, buttonClass, Skeleton } from "@/components/ui";
import { bookingWhen } from "@/lib/format";
import { getPublicSession, getSessionQueue } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Game queue",
  description: "Who's on court and who's up next at Danlex open play.",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default function QueuePage({ params }: PageProps<"/play/[id]/queue">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <Suspense fallback={<Skeleton className="h-[28rem]" />}>
        <Content params={params} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: { params: PageProps<"/play/[id]/queue">["params"] }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [session, queue] = await Promise.all([getPublicSession(id), getSessionQueue(id)]);
  if (!session) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-accent">Game queue</p>
          <h1 className="display mt-2 text-5xl">{session.title}</h1>
          <p className="mt-3 font-semibold">{bookingWhen(session.starts_at, session.ends_at)}</p>
        </div>
        <Link href={`/play/${session.id}`} className={buttonClass("secondary")}>
          Session details
        </Link>
      </div>
      {session.status === "cancelled" ? (
        <Alert>This session was cancelled.</Alert>
      ) : (
        <QueueBoard sessionId={session.id} initial={queue} ended={Date.parse(session.ends_at) <= new Date().getTime()} />
      )}
    </div>
  );
}
