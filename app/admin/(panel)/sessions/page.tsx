import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, cn, Skeleton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { courtDay } from "@/lib/court";
import { bookingWhen, money } from "@/lib/format";
import { KIND_LABEL } from "@/lib/open-play";
import { getAdminCourtConfig } from "@/lib/queries";
import type { Session, SignupStatus } from "@/lib/types";
import { saveSession } from "../../actions/sessions";
import { SessionFields } from "./session-fields";

export const metadata: Metadata = { title: "Open play" };

export default function SessionsPage({ searchParams }: PageProps<"/admin/sessions">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

type Counts = { confirmed: number; waiting: number; waitlist: number; refunds: number; checkedIn: number };

async function Content({ searchParams }: { searchParams: PageProps<"/admin/sessions">["searchParams"] }) {
  const { sb } = await requireAdmin();
  const { view } = await searchParams;
  const past = view === "past";
  const nowIso = new Date().toISOString();

  let q = sb.from("sessions").select("*");
  q = past ? q.lte("ends_at", nowIso).order("starts_at", { ascending: false }).limit(60) : q.gt("ends_at", nowIso).order("starts_at");
  const [{ data: rows }, { settings }] = await Promise.all([q.returns<Session[]>(), getAdminCourtConfig()]);
  const sessions = rows ?? [];
  const currency = settings?.currency ?? "PHP";

  const { data: signups } = sessions.length
    ? await sb
        .from("session_signups")
        .select("session_id, status, hold_expires_at, refund_needed, checked_in_at")
        .in(
          "session_id",
          sessions.map((s) => s.id),
        )
        .returns<{ session_id: string; status: SignupStatus; hold_expires_at: string | null; refund_needed: boolean; checked_in_at: string | null }[]>()
    : { data: [] };
  const counts = new Map<string, Counts>();
  for (const r of signups ?? []) {
    const c = counts.get(r.session_id) ?? { confirmed: 0, waiting: 0, waitlist: 0, refunds: 0, checkedIn: 0 };
    if (r.status === "confirmed") c.confirmed++;
    if (r.status === "confirmed" && r.checked_in_at) c.checkedIn++;
    if ((r.status === "held" || r.status === "offered") && r.hold_expires_at && r.hold_expires_at > nowIso) c.waiting++;
    if (r.status === "waitlisted") c.waitlist++;
    if (r.refund_needed) c.refunds++;
    counts.set(r.session_id, c);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-ink">Open play</p>
          <h1 className="display text-4xl">Sessions</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/sessions" className={tab(!past)}>
            Upcoming
          </Link>
          <Link href="/admin/sessions?view=past" className={tab(past)}>
            Past
          </Link>
        </div>
      </div>

      {!past && (
        <details className="rounded-2xl border border-dashed border-fg/20 p-5" open={sessions.length === 0}>
          <summary className="cursor-pointer font-bold text-accent">+ New session</summary>
          <p className="mt-2 text-sm text-ink">
            Posting a session books the court for its time, so rentals can&apos;t overlap it. Times are court time.
          </p>
          <ActionForm action={saveSession} className="mt-4 grid gap-4 md:grid-cols-3">
            <SessionFields defaultDay={courtDay()} />
            <div className="md:col-span-3">
              <SubmitButton>Post session</SubmitButton>
            </div>
          </ActionForm>
        </details>
      )}

      {sessions.length === 0 ? (
        <Card className="p-8 text-center text-ink">{past ? "No past sessions." : "No upcoming sessions. Post one above."}</Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sessions.map((s) => {
            const c = counts.get(s.id) ?? { confirmed: 0, waiting: 0, waitlist: 0, refunds: 0, checkedIn: 0 };
            const live = Date.parse(s.starts_at) <= Date.parse(nowIso) && Date.parse(s.ends_at) > Date.parse(nowIso);
            return (
              <Link key={s.id} href={`/admin/sessions/${s.id}`} className="block rounded-md">
                <Card className={cn("h-full space-y-3 p-5 transition hover:border-ball/50", c.refunds > 0 && "border-ball/50")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="display text-2xl">{s.title}</p>
                    <div className="flex flex-wrap gap-2">
                      {s.status === "cancelled" ? (
                        <Badge tone="danger">Cancelled</Badge>
                      ) : live ? (
                        <Badge tone="court">On now</Badge>
                      ) : (
                        <Badge tone={s.signups_open ? "electric" : "neutral"}>{s.signups_open ? "Sign-ups open" : "Sign-ups closed"}</Badge>
                      )}
                      {c.refunds > 0 && <Badge tone="ball">{c.refunds} refund{c.refunds === 1 ? "" : "s"}</Badge>}
                    </div>
                  </div>
                  <p className="font-semibold">{bookingWhen(s.starts_at, s.ends_at)}</p>
                  <p className="text-sm text-ink">
                    {KIND_LABEL[s.kind]} · {money(s.fee, currency)} · {s.level_note ?? "All levels"}
                  </p>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    <span>
                      <span className="score text-xl">{c.confirmed}</span>/{s.capacity} confirmed
                    </span>
                    {c.waiting > 0 && <span className="text-accent">{c.waiting} paying now</span>}
                    {c.waitlist > 0 && <span>{c.waitlist} waitlisted</span>}
                    {live && <span className="text-court">{c.checkedIn} checked in</span>}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

const tab = (active: boolean) =>
  cn(
    "rounded-lg border px-3 py-1.5 text-sm font-semibold transition",
    active ? "border-ball bg-ball/10 text-accent" : "border-fg/10 text-ink hover:text-fg",
  );
