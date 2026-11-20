import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Stripes } from "@/components/club";
import { buttonClass, Skeleton } from "@/components/ui";
import { bookingWhen, dateTime, money } from "@/lib/format";
import { levelLabel, SIGNUP_CODE } from "@/lib/open-play";
import { publicAssetUrl, QR_PLACEHOLDER } from "@/lib/queries";
import { createServiceClient } from "@/lib/supabase/server";
import type { CourtSettings, Session, SessionSignup } from "@/lib/types";
import { CancelForm, OfferLookup, OfferPay } from "./forms";

export const metadata: Metadata = { title: "Your open play spot", robots: { index: false } };

export default function SignupPage({ params, searchParams }: PageProps<"/play/s/[code]">) {
  return (
    <div className="mx-auto max-w-xl px-4 py-14">
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Status params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

type Row = Pick<
  SessionSignup,
  "id" | "code" | "status" | "name" | "level" | "amount" | "hold_token" | "hold_expires_at" | "payment_proof_path" | "refund_needed" | "created_at"
> & { sessions: Pick<Session, "id" | "title" | "starts_at" | "ends_at" | "fee" | "status"> };

async function Status({
  params,
  searchParams,
}: {
  params: PageProps<"/play/s/[code]">["params"];
  searchParams: PageProps<"/play/s/[code]">["searchParams"];
}) {
  await connection();
  const [{ code }, { t }] = await Promise.all([params, searchParams]);
  if (!SIGNUP_CODE.test(code)) notFound();

  // Only non-contact fields are read back; the code itself is the unguessable key.
  const sb = createServiceClient();
  const [{ data: s }, { data: settings }] = await Promise.all([
    sb
      .from("session_signups")
      .select(
        "id, code, status, name, level, amount, hold_token, hold_expires_at, payment_proof_path, refund_needed, created_at, sessions(id, title, starts_at, ends_at, fee, status)",
      )
      .eq("code", code)
      .maybeSingle<Row>(),
    sb
      .from("court_settings")
      .select("currency, payment_qr_path, payment_instructions")
      .maybeSingle<Pick<CourtSettings, "currency" | "payment_qr_path" | "payment_instructions">>(),
  ]);
  if (!s) notFound();

  const session = s.sessions;
  const currency = settings?.currency ?? "PHP";
  const now = new Date().getTime();
  const started = Date.parse(session.starts_at) <= now;
  const msLeft = s.hold_expires_at ? Date.parse(s.hold_expires_at) - now : 0;
  const tokenOk = typeof t === "string" && !!s.hold_token && t === s.hold_token;
  const canPay = !s.payment_proof_path && session.status === "scheduled" && (s.status === "held" || s.status === "offered");

  let place = 0;
  if (s.status === "waitlisted") {
    const { count } = await sb
      .from("session_signups")
      .select("id", { count: "exact", head: true })
      .eq("session_id", session.id)
      .eq("status", "waitlisted")
      .lte("created_at", s.created_at);
    place = count ?? 0;
  }

  // pay right here: the offer link (or a held spot reopened from its link)
  if (canPay && tokenOk && msLeft > 0) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm font-bold text-accent">{s.status === "offered" ? "A spot opened for you" : "Almost there"}</p>
          <h1 className="display mt-2 text-4xl">{session.title}</h1>
          <p className="mt-2 font-semibold">{bookingWhen(session.starts_at, session.ends_at)}</p>
        </div>
        <div className="rounded-md bg-panel p-5 sm:p-6">
          <OfferPay
            signupId={s.id}
            holdToken={s.hold_token!}
            amount={Number(s.amount)}
            msLeft={msLeft}
            currency={currency}
            qrUrl={publicAssetUrl(settings?.payment_qr_path ?? null) ?? QR_PLACEHOLDER}
            instructions={settings?.payment_instructions ?? null}
            offer={s.status === "offered"}
          />
        </div>
      </div>
    );
  }

  const copy = describe(s, session, place, now);
  const active = ["held", "confirmed", "waitlisted", "offered"].includes(s.status) && session.status === "scheduled";

  return (
    <div className="overflow-hidden rounded-md bg-panel text-center">
      <Stripes className="h-6" />
      <div className="px-6 pt-8 pb-6">
        <p className="display text-5xl sm:text-6xl">{copy.title}</p>
        <p className="mt-3 text-ink">{copy.body}</p>
      </div>
      {s.status === "offered" && session.status === "scheduled" && msLeft > 0 && !tokenOk && (
        <div className="mx-4 mb-6 rounded-md bg-well p-5 text-left sm:mx-6">
          <p className="mb-3 font-bold">Held for you until {dateTime(s.hold_expires_at!)}.</p>
          <OfferLookup code={s.code} />
        </div>
      )}
      <div className="mx-4 space-y-4 rounded-md bg-ticket p-5 text-pine-950 sm:mx-6">
        <div>
          <p className="text-sm font-bold">Your code</p>
          <p className="score mt-1 text-4xl tracking-wider text-pine-900">{s.code}</p>
          {s.status === "confirmed" && <p className="mt-2 text-xs">Screenshot this page and show it when you check in.</p>}
        </div>
        <dl className="mx-auto max-w-sm space-y-2 border-t border-dashed border-pine-900/40 pt-4 text-left text-sm">
          <div className="flex justify-between gap-4">
            <dt>Session</dt>
            <dd className="text-right font-bold">{session.title}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>When</dt>
            <dd className="text-right font-bold">{bookingWhen(session.starts_at, session.ends_at)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Player</dt>
            <dd className="text-right font-bold">
              {s.name.split(" ")[0]} · {levelLabel(s.level)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>{s.payment_proof_path ? "Paid" : "Fee"}</dt>
            <dd className="font-bold">{money(s.payment_proof_path ? s.amount : session.fee, currency)}</dd>
          </div>
        </dl>
      </div>
      <div className="flex flex-wrap justify-center gap-3 p-6">
        {s.status === "confirmed" && (
          <Link href={`/play/${session.id}/queue`} className={buttonClass("secondary")}>
            Game queue
          </Link>
        )}
        {(s.status === "expired" && !s.payment_proof_path) || s.status === "cancelled" ? (
          <Link href={`/play/${session.id}`} className={buttonClass()}>
            Join again
          </Link>
        ) : null}
        <Link href="/play" className={buttonClass("ghost")}>
          All sessions
        </Link>
      </div>
      {active && !started && (
        <div className="border-t border-fg/10 px-6 py-5">
          <CancelForm code={s.code} paid={!!s.payment_proof_path} />
        </div>
      )}
    </div>
  );
}

function describe(s: Row, session: Row["sessions"], place: number, now: number): { title: string; body: string } {
  if (session.status === "cancelled") {
    return {
      title: "Session cancelled",
      body: s.payment_proof_path
        ? "The organisers cancelled this session. You'll be refunded — they'll contact you."
        : "The organisers cancelled this session.",
    };
  }
  switch (s.status) {
    case "confirmed":
      return {
        title: "You're in!",
        body:
          Date.parse(session.ends_at) <= now
            ? "Thanks for playing."
            : "Your spot is confirmed. Check in at the court and we'll put you in the game queue.",
      };
    case "waitlisted":
      return {
        title: "You're on the waitlist",
        body: `You're number ${place} in line. If a spot opens more than 30 minutes before the start, we'll email you a link to pay and claim it.`,
      };
    case "offered":
      return {
        title: "A spot opened",
        body: "It's yours if you pay before the offer runs out. Use the link in your email, or your mobile number below.",
      };
    case "held":
      return {
        title: "Almost there",
        body: "This spot is waiting for payment. Go back to the page you were on to finish, or join again.",
      };
    case "expired":
      return s.payment_proof_path
        ? {
            title: "Payment received",
            body: "Your payment came in after the spot was gone, so you're not in this session. We've kept your receipt and the organisers will refund you.",
          }
        : { title: "Spot lapsed", body: "This spot wasn't paid for in time and went to someone else." };
    case "cancelled":
      return {
        title: "Spot cancelled",
        body: s.refund_needed
          ? "You gave up your spot. The organisers will refund you."
          : "You gave up your spot. Thanks for letting us know.",
      };
  }
}
