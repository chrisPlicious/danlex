import Link from "next/link";
import { Suspense } from "react";
import { Badge, buttonClass, Card, EntryCount, Skeleton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { courtDay, courtInstant } from "@/lib/court";
import { bookingWhen, dateTime, money } from "@/lib/format";
import { getAdminCourtConfig, getAdminTournament } from "@/lib/queries";
import { displayName, type Booking, type BracketRow, type Registration } from "@/lib/types";

export default function Dashboard() {
  return (
    <div className="space-y-10">
      <Suspense fallback={<Skeleton className="h-64" />}>
        <CourtSummary />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

async function CourtSummary() {
  const { sb } = await requireAdmin();
  const today = courtDay();
  const nowIso = new Date().toISOString();
  const [{ settings, playTypes }, { data: todays }, { count: upcoming }, { count: refunds }] = await Promise.all([
    getAdminCourtConfig(),
    sb
      .from("bookings")
      .select("*")
      .eq("status", "confirmed")
      .gte("starts_at", courtInstant(today, 0).toISOString())
      .lt("starts_at", courtInstant(today, 24).toISOString())
      .order("starts_at")
      .returns<Booking[]>(),
    sb.from("bookings").select("id", { count: "exact", head: true }).eq("status", "confirmed").gte("starts_at", nowIso),
    sb
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "expired")
      .not("payment_proof_path", "is", null),
  ]);
  const currency = settings?.currency ?? "PHP";
  const typeName = new Map(playTypes.map((p) => [p.id, p.name]));
  const list = todays ?? [];
  const takings = list.reduce((sum, b) => sum + Number(b.amount), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-ink">Court rental</p>
          <h1 className="display text-4xl">Today on court</h1>
        </div>
        <Badge tone={settings?.bookings_open ? "court" : "ball"}>
          {settings?.bookings_open ? "Bookings open" : "Bookings paused"}
        </Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Booked today" value={String(list.length)} sub={money(takings, currency)} />
        <Stat label="Upcoming" value={String(upcoming ?? 0)} sub="confirmed from now on" />
        <Link href="/admin/bookings?status=refund" className="block rounded-md">
          <Stat label="Refund / rebook" value={String(refunds ?? 0)} sub="paid after their hold lapsed" alert={!!refunds} />
        </Link>
      </div>
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="display text-2xl">Today&apos;s schedule</h2>
          <div className="flex gap-4 text-sm font-bold">
            <Link href="/admin/court" className="text-ink hover:text-fg">
              Court &amp; rates
            </Link>
            <Link href="/admin/bookings" className="text-accent hover:underline">
              All bookings →
            </Link>
          </div>
        </div>
        {list.length > 0 ? (
          <ul className="divide-y divide-fg/10">
            {list.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-bold">{bookingWhen(b.starts_at, b.ends_at).split(" · ")[1]}</p>
                  <p className="text-xs text-ink">
                    {b.name} · {typeName.get(b.play_type_id) ?? "—"} · {b.confirmation_code}
                  </p>
                </div>
                <Badge tone={b.source === "admin" ? "neutral" : "court"}>{b.source === "admin" ? "walk-in" : "online"}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink">No bookings today.</p>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, sub, alert }: { label: string; value: string; sub: string; alert?: boolean }) {
  return (
    <Card className={alert ? "border-ball/60 p-5" : "p-5"}>
      <p className="text-xs font-bold uppercase tracking-widest text-ink">{label}</p>
      <p className={alert ? "score mt-2 text-4xl text-accent" : "score mt-2 text-4xl"}>{value}</p>
      <p className="mt-1 text-sm text-ink">{sub}</p>
    </Card>
  );
}

async function DashboardContent() {
  const { sb } = await requireAdmin();
  const data = await getAdminTournament();
  if (!data) {
    return (
      <Card className="p-8 text-center">
        <p className="display text-3xl">No tournament yet</p>
        <p className="mt-2 text-ink">Create one to open registration.</p>
        <Link href="/admin/settings" className={`${buttonClass()} mt-6`}>
          Create tournament
        </Link>
      </Card>
    );
  }
  const { tournament, divisions } = data;
  const ids = divisions.map((d) => d.id);

  const [{ data: recent }, { data: brackets }] = await Promise.all([
    sb
      .from("registrations")
      .select("*")
      .in("division_id", ids)
      .order("created_at", { ascending: false })
      .limit(8)
      .returns<Registration[]>(),
    sb.from("brackets").select("*").in("division_id", ids).returns<BracketRow[]>(),
  ]);
  const divisionName = Object.fromEntries(divisions.map((d) => [d.id, d.name]));
  const bracketOf = (id: string) => brackets?.find((b) => b.division_id === id);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-ink">Tournament</p>
          <h2 className="display text-4xl">{tournament.name}</h2>
        </div>
        <Badge tone={tournament.status === "open" ? "court" : "ball"}>{tournament.status.replace("_", " ")}</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {divisions.map((d) => {
          const b = bracketOf(d.id);
          return (
            <Card key={d.id} className="space-y-4 p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="display text-2xl">{d.name}</p>
                <div className="flex gap-2">
                  <Badge tone={d.registration_open ? "court" : "neutral"}>{d.registration_open ? "Open" : "Closed"}</Badge>
                  <Badge tone={b ? (b.status === "draft" ? "ball" : "electric") : "neutral"}>
                    {b ? `Bracket ${b.status}` : "No bracket"}
                  </Badge>
                </div>
              </div>
              <EntryCount count={d.confirmed_count} kind={d.kind} />
              <p className="text-sm text-ink">
                Collected {money(Number(d.fee) * d.confirmed_count, tournament.currency)} · fee{" "}
                {money(d.fee, tournament.currency)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href={`/admin/registrations?division=${d.id}`} className={buttonClass("secondary", "sm")}>
                  Entries
                </Link>
                <Link href={`/admin/brackets/${d.id}`} className={buttonClass("secondary", "sm")}>
                  Bracket
                </Link>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="display text-2xl">Latest registrations</h2>
          <Link href="/admin/registrations" className="text-sm font-bold text-accent hover:underline">
            All →
          </Link>
        </div>
        {recent && recent.length > 0 ? (
          <ul className="divide-y divide-white/5">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-bold">{displayName(r)}</p>
                  <p className="text-xs text-ink">
                    {divisionName[r.division_id]} · {r.confirmation_code} · {dateTime(r.created_at)}
                  </p>
                </div>
                <Badge tone={r.status === "confirmed" ? "court" : "danger"}>{r.status}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink">No registrations yet.</p>
        )}
      </Card>
    </div>
  );
}
