import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Button, buttonClass, Card, cn, Field, Input, Select, Skeleton, Textarea } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { courtDay, courtInstant, hourLabel } from "@/lib/court";
import { bookingWhen, dateTime, dayLabel, money } from "@/lib/format";
import { getAdminCourtConfig } from "@/lib/queries";
import type { Booking, PlayType } from "@/lib/types";
import {
  addBooking,
  deleteBooking,
  resendBookingConfirmation,
  setBookingStatus,
  updateBooking,
} from "../../actions/court";

export const metadata: Metadata = { title: "Bookings" };

const VIEWS = { upcoming: "Upcoming", today: "Today", past: "Past" } as const;
const STATUSES = {
  active: "Confirmed + needs action",
  confirmed: "Confirmed",
  refund: "Refund / rebook",
  cancelled: "Cancelled",
  held: "Awaiting payment",
  all: "Everything",
} as const;
type View = keyof typeof VIEWS;
type StatusFilter = keyof typeof STATUSES;

export default function BookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <BookingsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function BookingsContent({ searchParams }: { searchParams: PageProps<"/admin/bookings">["searchParams"] }) {
  const { sb } = await requireAdmin();
  const params = await searchParams;
  const pick = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);

  const today = courtDay();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(pick("day") ?? "") ? pick("day")! : undefined;
  const view: View | "day" = day ? "day" : ((Object.keys(VIEWS) as View[]).find((v) => v === pick("view")) ?? "upcoming");
  const status: StatusFilter = (Object.keys(STATUSES) as StatusFilter[]).find((s) => s === pick("status")) ?? "active";

  const { settings, playTypes } = await getAdminCourtConfig();
  const currency = settings?.currency ?? "PHP";

  let q = sb.from("bookings").select("*");
  const startOfToday = courtInstant(today, 0).toISOString();
  if (view === "upcoming") q = q.gte("starts_at", startOfToday).order("starts_at");
  if (view === "today") q = q.gte("starts_at", startOfToday).lt("starts_at", courtInstant(today, 24).toISOString()).order("starts_at");
  if (view === "past") q = q.lt("starts_at", startOfToday).order("starts_at", { ascending: false }).limit(200);
  if (view === "day" && day) {
    q = q.gte("starts_at", courtInstant(day, 0).toISOString()).lt("starts_at", courtInstant(day, 24).toISOString()).order("starts_at");
  }
  if (status === "active") q = q.or("status.eq.confirmed,and(status.eq.expired,payment_proof_path.not.is.null)");
  if (status === "confirmed") q = q.eq("status", "confirmed");
  if (status === "refund") q = q.eq("status", "expired").not("payment_proof_path", "is", null);
  if (status === "cancelled") q = q.eq("status", "cancelled");
  if (status === "held") q = q.eq("status", "held").gt("hold_expires_at", new Date().toISOString());
  const { data: rows } = await q.returns<Booking[]>();
  const bookings = rows ?? [];

  const paths = bookings.map((b) => b.payment_proof_path).filter((p): p is string => !!p);
  const { data: signed } = paths.length
    ? await sb.storage.from("payment-proofs").createSignedUrls(paths, 60 * 60)
    : { data: [] };
  const proofUrl = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const typeById = new Map(playTypes.map((p) => [p.id, p]));

  // group by court-local day
  const groups = new Map<string, Booking[]>();
  for (const b of bookings) {
    const key = courtDay(new Date(b.starts_at));
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }

  const href = (p: { view?: string; status?: string; day?: string }) => {
    const qs = new URLSearchParams();
    const v = "view" in p ? p.view : view === "day" ? undefined : view;
    const d = "day" in p ? p.day : "view" in p ? undefined : day;
    const s = "status" in p ? p.status : status;
    if (d) qs.set("day", d);
    else if (v && v !== "upcoming") qs.set("view", v);
    if (s && s !== "active") qs.set("status", s);
    const str = qs.toString();
    return `/admin/bookings${str ? `?${str}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-4xl">Court bookings</h1>
        <form action="/admin/bookings" className="flex items-end gap-2">
          <Field label="Jump to day">
            <Input type="date" name="day" defaultValue={day ?? today} className="w-44" />
          </Field>
          <Button type="submit" variant="secondary">
            Go
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <FilterLink key={v} href={href({ view: v })} active={view === v}>
            {VIEWS[v]}
          </FilterLink>
        ))}
        {day && (
          <FilterLink href={href({ day })} active>
            {dayLabel(day)}
          </FilterLink>
        )}
        <span className="mx-2 w-px bg-fg/10" />
        {(Object.keys(STATUSES) as StatusFilter[]).map((s) => (
          <FilterLink key={s} href={href({ status: s })} active={status === s}>
            {STATUSES[s]}
          </FilterLink>
        ))}
      </div>

      <details className="rounded-2xl border border-dashed border-fg/20 p-5">
        <summary className="cursor-pointer font-bold text-accent">+ Add walk-in / phone booking</summary>
        <p className="mt-2 text-sm text-ink">
          Confirmed straight away, no receipt needed. Leave the amount blank to charge rate × hours.
        </p>
        <ActionForm action={addBooking} className="mt-4 grid gap-4 md:grid-cols-3">
          <Field label="Play type">
            <Select name="play_type_id" required defaultValue={playTypes.find((p) => p.active)?.id}>
              {playTypes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {money(p.rate, currency)}/hr{p.active ? "" : " (off)"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" name="day" defaultValue={day ?? today} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">
              <Select name="hour" defaultValue={String(settings?.open_hour ?? 6)}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Hours">
              <Select name="hours" defaultValue="1">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <DetailFields />
          <div className="md:col-span-3">
            <SubmitButton>Add booking</SubmitButton>
          </div>
        </ActionForm>
      </details>

      {bookings.length === 0 ? (
        <Card className="p-8 text-center text-ink">No bookings match.</Card>
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([d, list]) => (
            <section key={d} className="space-y-3">
              <h2 className="display text-2xl">
                {dayLabel(d)}
                {d === today && <span className="ml-2 text-court">· Today</span>}
              </h2>
              {list.map((b) => (
                <BookingRow
                  key={b.id}
                  b={b}
                  playType={b.play_type_id ? typeById.get(b.play_type_id) : undefined}
                  currency={currency}
                  proof={(b.payment_proof_path && proofUrl.get(b.payment_proof_path)) || undefined}
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-sm font-semibold transition",
        active ? "border-ball bg-ball/10 text-accent" : "border-fg/10 text-ink hover:text-fg",
      )}
    >
      {children}
    </Link>
  );
}

function DetailFields({ b }: { b?: Booking }) {
  return (
    <>
      <Field label="Name">
        <Input name="name" defaultValue={b?.name} required />
      </Field>
      <Field label="Mobile">
        <Input name="phone" defaultValue={b?.phone} required />
      </Field>
      <Field label="Email">
        <Input name="email" type="email" defaultValue={b?.email ?? ""} />
      </Field>
      <Field label="Amount">
        <Input
          name="amount"
          type="number"
          min={0}
          step="0.01"
          defaultValue={b ? Number(b.amount) : ""}
          placeholder="rate × hours"
          required={!!b}
        />
      </Field>
      <Field label="Payment ref">
        <Input name="payment_ref" defaultValue={b?.payment_ref ?? ""} />
      </Field>
      <Field label="Admin notes">
        <Textarea name="admin_notes" defaultValue={b?.admin_notes ?? ""} className="min-h-11" />
      </Field>
    </>
  );
}

const STATUS_TONE = { confirmed: "court", held: "ball", expired: "neutral", cancelled: "danger" } as const;

function BookingRow({ b, playType, currency, proof }: { b: Booking; playType?: PlayType; currency: string; proof?: string }) {
  const needsRefund = b.status === "expired" && !!b.payment_proof_path;
  const live = b.status === "confirmed" || b.status === "held";

  // an open play session's court time: managed from the session, not here
  if (b.session_id) {
    return (
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid size-20 shrink-0 place-items-center rounded-lg border border-dashed border-magenta/40 text-center text-[10px] font-bold uppercase text-magenta-soft">
            Open play
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-bold">{bookingWhen(b.starts_at, b.ends_at)}</p>
              <Badge tone={STATUS_TONE[b.status]}>{b.status}</Badge>
              <Badge tone="magenta">Open play</Badge>
            </div>
            <p className="mt-1 text-sm text-fg/90">{b.name}</p>
          </div>
          <Link href={`/admin/sessions/${b.session_id}`} className={buttonClass("secondary", "sm")}>
            Manage session
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn("p-4", needsRefund && "border-ball/50")}>
      <div className="flex flex-wrap items-start gap-4">
        {proof ? (
          <a href={proof} target="_blank" rel="noreferrer" className="shrink-0" title="Open payment proof">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proof} alt="Payment proof" className="size-20 rounded-lg border border-fg/10 object-cover" />
          </a>
        ) : (
          <div className="grid size-20 shrink-0 place-items-center rounded-lg border border-dashed border-fg/15 text-center text-[10px] font-bold uppercase text-ink">
            {b.source === "admin" ? "Walk-in" : "No proof"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-bold">{bookingWhen(b.starts_at, b.ends_at)}</p>
            <Badge tone={STATUS_TONE[b.status]}>{b.status === "held" ? "awaiting payment" : b.status}</Badge>
            {needsRefund && <Badge tone="ball">Refund / rebook</Badge>}
            {playType && <Badge tone="electric">{playType.name}</Badge>}
          </div>
          <p className="mt-1 text-sm text-ink">
            {b.confirmation_code && <span className="font-mono text-accent">{b.confirmation_code} · </span>}
            {money(b.amount, currency)} · booked {dateTime(b.created_at)}
            {b.payment_ref && <> · ref {b.payment_ref}</>}
          </p>
          <p className="mt-1 text-sm break-words text-fg/90">
            {b.name} · {b.phone}
            {b.email && ` · ${b.email}`}
          </p>
          {b.admin_notes && <p className="mt-1 text-sm text-accent">Note: {b.admin_notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionForm
            action={setBookingStatus}
            confirm={live ? "Cancel this booking? The time becomes free for others." : undefined}
          >
            <input type="hidden" name="id" value={b.id} />
            <input type="hidden" name="status" value={live ? "cancelled" : "confirmed"} />
            <SubmitButton variant={live ? "danger" : "secondary"} size="sm">
              {live ? "Cancel" : "Confirm"}
            </SubmitButton>
          </ActionForm>
          {b.status === "confirmed" && b.email && (
            <ActionForm action={resendBookingConfirmation}>
              <input type="hidden" name="id" value={b.id} />
              <SubmitButton variant="secondary" size="sm" pendingLabel="Sending…">
                Email code
              </SubmitButton>
            </ActionForm>
          )}
          <ActionForm action={deleteBooking} confirm="Delete this booking and its payment proof permanently?">
            <input type="hidden" name="id" value={b.id} />
            <SubmitButton variant="ghost" size="sm" pendingLabel="Deleting…">
              Delete
            </SubmitButton>
          </ActionForm>
        </div>
      </div>
      <details className="mt-3 border-t border-fg/10 pt-3">
        <summary className="cursor-pointer text-sm font-bold text-ink hover:text-fg">Edit details</summary>
        <ActionForm action={updateBooking} className="mt-3 grid gap-3 md:grid-cols-3">
          <input type="hidden" name="id" value={b.id} />
          <DetailFields b={b} />
          <div className="md:col-span-3">
            <SubmitButton size="sm">Save changes</SubmitButton>
          </div>
        </ActionForm>
      </details>
    </Card>
  );
}
