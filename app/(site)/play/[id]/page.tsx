import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Alert, buttonClass, Skeleton } from "@/components/ui";
import { bookingWhen } from "@/lib/format";
import { KIND_LABEL } from "@/lib/open-play";
import { getCourtConfig, getPublicSession, publicAssetUrl, QR_PLACEHOLDER } from "@/lib/queries";
import { JoinWizard } from "./join-wizard";

export const metadata: Metadata = {
  title: "Join open play",
  description: "Grab a spot in a Danlex open play session.",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default function SessionPage({ params }: PageProps<"/play/[id]">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <Suspense fallback={<Skeleton className="h-[28rem]" />}>
        <Content params={params} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: { params: PageProps<"/play/[id]">["params"] }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [session, { settings }] = await Promise.all([getPublicSession(id), getCourtConfig()]);
  if (!session) notFound();
  await connection();
  const now = new Date().getTime();

  const header = (
    <>
      <p className="text-sm font-bold text-accent">{KIND_LABEL[session.kind]}</p>
      <h1 className="display mt-2 text-5xl">{session.title}</h1>
      <p className="mt-3 text-lg font-semibold">{bookingWhen(session.starts_at, session.ends_at)}</p>
    </>
  );
  const queueLink = (
    <Link href={`/play/${session.id}/queue`} className={buttonClass("secondary")}>
      Game queue
    </Link>
  );

  if (session.status === "cancelled") {
    return (
      <div className="space-y-6">
        {header}
        <Alert>This session was cancelled. Anyone who paid will be refunded.</Alert>
        <Link href="/play" className={buttonClass()}>
          Other sessions
        </Link>
      </div>
    );
  }
  if (Date.parse(session.ends_at) <= now) {
    return (
      <div className="space-y-6">
        {header}
        <Alert tone="ball">This session has ended.</Alert>
        <div className="flex flex-wrap gap-3">
          {queueLink}
          <Link href="/play" className={buttonClass()}>
            Upcoming sessions
          </Link>
        </div>
      </div>
    );
  }
  if (Date.parse(session.starts_at) <= now) {
    return (
      <div className="space-y-6">
        {header}
        <Alert tone="court">This session is on now. Sign-ups are closed, but you can follow the games.</Alert>
        <div className="flex flex-wrap gap-3">
          <Link href={`/play/${session.id}/queue`} className={buttonClass()}>
            Watch the queue
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>{header}</div>
        {queueLink}
      </div>
      {settings ? (
        <JoinWizard
          initial={session}
          currency={settings.currency}
          qrUrl={publicAssetUrl(settings.payment_qr_path) ?? QR_PLACEHOLDER}
          instructions={settings.payment_instructions}
        />
      ) : (
        <Alert tone="ball">Payments aren&apos;t set up yet. Please check back soon.</Alert>
      )}
    </div>
  );
}
