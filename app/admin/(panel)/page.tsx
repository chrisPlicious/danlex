import Link from "next/link";
import { Badge, buttonClass, Card, SlotMeter } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { dateTime, money } from "@/lib/format";
import { getAdminTournament } from "@/lib/queries";
import { displayName, type BracketRow, type Registration } from "@/lib/types";

export default async function Dashboard() {
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
          <h1 className="display text-4xl">{tournament.name}</h1>
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
              <SlotMeter cap={d.slot_cap} taken={d.confirmed_count} accent={d.kind === "singles" ? "electric" : "magenta"} />
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
          <Link href="/admin/registrations" className="text-sm font-bold text-ball hover:underline">
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
