import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Stripes } from "@/components/club";
import { buttonClass, Skeleton } from "@/components/ui";
import { bookingWhen, money } from "@/lib/format";
import { createServiceClient } from "@/lib/supabase/server";
import type { BookingStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Court booked", robots: { index: false } };

export default function BookingSuccessPage({ params }: PageProps<"/book/success/[code]">) {
  return (
    <div className="mx-auto max-w-xl px-4 py-14">
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Confirmation params={params} />
      </Suspense>
    </div>
  );
}

const COPY: Record<BookingStatus, { title: string; body: string }> = {
  confirmed: { title: "You're booked!", body: "Your court time is confirmed. See you on court." },
  expired: {
    title: "Payment received",
    body: "Your payment came in after your hold ran out and that time is no longer free. We've kept your receipt — the organisers will contact you to refund or move your booking.",
  },
  cancelled: {
    title: "Booking cancelled",
    body: "This booking was cancelled. Please contact the organisers if you have questions.",
  },
  held: { title: "Almost there", body: "This booking is still waiting for payment." },
};

async function Confirmation({ params }: { params: PageProps<"/book/success/[code]">["params"] }) {
  await connection();
  const { code } = await params;
  if (!/^DLB-[0-9A-F]{8}$/.test(code)) notFound();

  // Only non-contact fields are read back; the code itself is the unguessable key.
  const sb = createServiceClient();
  const [{ data }, { data: settings }] = await Promise.all([
    sb
      .from("bookings")
      .select("confirmation_code, status, starts_at, ends_at, amount, play_types(name)")
      .eq("confirmation_code", code)
      .maybeSingle<{
        confirmation_code: string;
        status: BookingStatus;
        starts_at: string;
        ends_at: string;
        amount: number | string;
        play_types: { name: string };
      }>(),
    sb.from("court_settings").select("currency").maybeSingle<{ currency: string }>(),
  ]);
  if (!data) notFound();

  const copy = COPY[data.status];

  return (
    <div className="overflow-hidden rounded-md bg-panel text-center">
      <Stripes className="h-6" />
      <div className="px-6 pt-8 pb-6">
        <p className="display text-6xl">{copy.title}</p>
        <p className="mt-3 text-ink">{copy.body}</p>
      </div>
      <div className="mx-4 space-y-4 rounded-md bg-ticket p-5 text-pine-950 sm:mx-6">
        <div>
          <p className="text-sm font-bold">Booking code</p>
          <p className="score mt-1 text-4xl tracking-wider text-pine-900">{data.confirmation_code}</p>
          <p className="mt-2 text-xs">Screenshot this page and show it at the court.</p>
        </div>
        <dl className="mx-auto max-w-sm space-y-2 border-t border-dashed border-pine-900/40 pt-4 text-left text-sm">
          <div className="flex justify-between gap-4">
            <dt>Play type</dt>
            <dd className="font-bold">{data.play_types.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>When</dt>
            <dd className="text-right font-bold">{bookingWhen(data.starts_at, data.ends_at)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Paid</dt>
            <dd className="font-bold">{money(data.amount, settings?.currency ?? "PHP")}</dd>
          </div>
        </dl>
      </div>
      <div className="flex flex-wrap justify-center gap-3 p-6">
        <Link href="/book" className={buttonClass("secondary")}>
          Book another time
        </Link>
        <Link href="/" className={buttonClass("ghost")}>
          Home
        </Link>
      </div>
    </div>
  );
}
