import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Alert, Skeleton } from "@/components/ui";
import { getCourtConfig, getTournamentDays, publicAssetUrl, QR_PLACEHOLDER } from "@/lib/queries";
import { BookingWizard } from "./wizard";

export const metadata: Metadata = {
  title: "Book the court",
  description: "Pick a play type, choose your hours and book the Danlex pickleball court.",
};

export default function BookPage({ searchParams }: PageProps<"/book">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <p className="text-sm font-bold text-accent">Court rental</p>
      <h1 className="display mt-2 mb-8 text-5xl">Book the court</h1>
      <Suspense fallback={<Skeleton className="h-[28rem]" />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/book">["searchParams"] }) {
  const [{ type }, { settings, playTypes }, tournamentDays] = await Promise.all([
    searchParams,
    getCourtConfig(),
    getTournamentDays(),
  ]);
  await connection();
  // the client starts from the server's clock so the first render matches on both sides
  const now = new Date().toISOString();

  if (!settings) return <Alert tone="ball">Court bookings aren&apos;t set up yet. Please check back soon.</Alert>;
  if (!settings.bookings_open) return <Alert tone="ball">Court bookings are paused right now. Please check back soon.</Alert>;

  const bookable = playTypes.filter((p) => Number(p.rate) > 0);
  if (bookable.length === 0) return <Alert tone="ball">Court rental options will be posted soon.</Alert>;

  return (
    <BookingWizard
      settings={settings}
      playTypes={bookable}
      tournamentDays={tournamentDays}
      initialSlug={typeof type === "string" ? type : undefined}
      now={now}
      qrUrl={publicAssetUrl(settings.payment_qr_path) ?? QR_PLACEHOLDER}
    />
  );
}
