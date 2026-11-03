import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonClass, Card, cn, Field, Input, Select, Skeleton, Textarea } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { getAdminTournament } from "@/lib/queries";
import { displayName, type Division, type Registration } from "@/lib/types";
import {
  addRegistration,
  deleteRegistration,
  setRegistrationStatus,
  updateRegistration,
} from "../../actions/registrations";

export const metadata: Metadata = { title: "Registrations" };

const STATUSES = ["confirmed", "rejected", "withdrawn"] as const;

export default function RegistrationsPage({ searchParams }: PageProps<"/admin/registrations">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <RegistrationsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function RegistrationsContent({
  searchParams,
}: {
  searchParams: PageProps<"/admin/registrations">["searchParams"];
}) {
  const { sb } = await requireAdmin();
  const { division: divisionParam, status: statusParam } = await searchParams;
  const data = await getAdminTournament();
  if (!data) return <p className="text-ink">Create a tournament first.</p>;

  const divisions = data.divisions;
  const division = divisions.find((d) => d.id === divisionParam);
  const status = STATUSES.find((s) => s === statusParam);

  let q = sb
    .from("registrations")
    .select("*")
    .in(
      "division_id",
      division ? [division.id] : divisions.map((d) => d.id),
    )
    .order("created_at", { ascending: true });
  if (status) q = q.eq("status", status);
  const { data: rows } = await q.returns<Registration[]>();
  const regs = rows ?? [];

  const paths = regs.map((r) => r.payment_proof_path).filter((p): p is string => !!p);
  const { data: signed } = paths.length
    ? await sb.storage.from("payment-proofs").createSignedUrls(paths, 60 * 60)
    : { data: [] };
  const proofUrl = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const byId = Object.fromEntries(divisions.map((d) => [d.id, d]));

  const filterHref = (p: { division?: string; status?: string }) => {
    const params = new URLSearchParams();
    const d = "division" in p ? p.division : division?.id;
    const s = "status" in p ? p.status : status;
    if (d) params.set("division", d);
    if (s) params.set("status", s);
    const qs = params.toString();
    return `/admin/registrations${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-4xl">Registrations</h1>
        <a href={`/admin/registrations/export${division ? `?division=${division.id}` : ""}`} className={buttonClass("secondary", "sm")}>
          Export CSV
        </a>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterLink href={filterHref({ division: undefined })} active={!division}>
          All divisions
        </FilterLink>
        {divisions.map((d) => (
          <FilterLink key={d.id} href={filterHref({ division: d.id })} active={division?.id === d.id}>
            {d.name} ({d.confirmed_count}/{d.slot_cap})
          </FilterLink>
        ))}
        <span className="mx-2 w-px bg-white/10" />
        <FilterLink href={filterHref({ status: undefined })} active={!status}>
          Any status
        </FilterLink>
        {STATUSES.map((s) => (
          <FilterLink key={s} href={filterHref({ status: s })} active={status === s}>
            {s}
          </FilterLink>
        ))}
      </div>

      <details className="rounded-2xl border border-dashed border-white/20 p-5">
        <summary className="cursor-pointer font-bold text-ball">+ Add walk-in entry</summary>
        <p className="mt-2 text-sm text-ink">For cash or on-site payments. Still counts against the slot cap.</p>
        <ActionForm action={addRegistration} className="mt-4 grid gap-4 md:grid-cols-3">
          <Field label="Division">
            <Select name="division_id" defaultValue={division?.id ?? divisions[0]?.id} required>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <DetailFields />
          <div className="md:col-span-3">
            <SubmitButton>Add entry</SubmitButton>
          </div>
        </ActionForm>
      </details>

      {regs.length === 0 ? (
        <Card className="p-8 text-center text-ink">No registrations match.</Card>
      ) : (
        <div className="space-y-3">
          {regs.map((r) => (
            <RegistrationRow
              key={r.id}
              r={r}
              division={byId[r.division_id]}
              proof={(r.payment_proof_path && proofUrl.get(r.payment_proof_path)) || undefined}
            />
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
        "rounded-lg border px-3 py-1.5 text-sm font-semibold capitalize transition",
        active ? "border-ball bg-ball/10 text-ball" : "border-white/10 text-ink hover:text-chrome",
      )}
    >
      {children}
    </Link>
  );
}

function DetailFields({ r }: { r?: Registration }) {
  return (
    <>
      <Field label="Player 1 name">
        <Input name="player1_name" defaultValue={r?.player1_name} required />
      </Field>
      <Field label="Player 1 mobile">
        <Input name="player1_phone" defaultValue={r?.player1_phone} required />
      </Field>
      <Field label="Player 1 email">
        <Input name="player1_email" type="email" defaultValue={r?.player1_email} required />
      </Field>
      <Field label="Player 2 name (doubles)">
        <Input name="player2_name" defaultValue={r?.player2_name ?? ""} />
      </Field>
      <Field label="Player 2 mobile">
        <Input name="player2_phone" defaultValue={r?.player2_phone ?? ""} />
      </Field>
      <Field label="Player 2 email">
        <Input name="player2_email" type="email" defaultValue={r?.player2_email ?? ""} />
      </Field>
      <Field label="Team name">
        <Input name="team_name" defaultValue={r?.team_name ?? ""} />
      </Field>
      <Field label="Payment ref">
        <Input name="payment_ref" defaultValue={r?.payment_ref ?? ""} />
      </Field>
      <Field label="Admin notes">
        <Textarea name="admin_notes" defaultValue={r?.admin_notes ?? ""} className="min-h-11" />
      </Field>
    </>
  );
}

function RegistrationRow({ r, division, proof }: { r: Registration; division?: Division; proof?: string }) {
  const confirmed = r.status === "confirmed";
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start gap-4">
        {proof ? (
          <a href={proof} target="_blank" rel="noreferrer" className="shrink-0" title="Open payment proof">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proof} alt="Payment proof" className="size-20 rounded-lg border border-white/10 object-cover" />
          </a>
        ) : (
          <div className="grid size-20 shrink-0 place-items-center rounded-lg border border-dashed border-white/15 text-center text-[10px] font-bold uppercase text-ink">
            {r.source === "admin" ? "Walk-in" : "No proof"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-bold">{displayName(r)}</p>
            <Badge tone={confirmed ? "court" : "danger"}>{r.status}</Badge>
            {division && <Badge tone={division.kind === "singles" ? "electric" : "magenta"}>{division.name}</Badge>}
          </div>
          <p className="mt-1 text-sm text-ink">
            <span className="font-mono text-ball">{r.confirmation_code}</span> · {dateTime(r.created_at)}
            {r.payment_ref && <> · ref {r.payment_ref}</>}
          </p>
          <p className="mt-1 text-sm break-words text-chrome/90">
            {r.player1_name} · {r.player1_phone} · {r.player1_email}
            {r.player2_name && (
              <>
                <br />
                {r.player2_name}
                {r.player2_phone && ` · ${r.player2_phone}`}
                {r.player2_email && ` · ${r.player2_email}`}
              </>
            )}
          </p>
          {r.admin_notes && <p className="mt-1 text-sm text-ball/80">Note: {r.admin_notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionForm
            action={setRegistrationStatus}
            confirm={confirmed ? "Reject this entry? Their slot will be freed." : undefined}
          >
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="status" value={confirmed ? "rejected" : "confirmed"} />
            <SubmitButton variant={confirmed ? "danger" : "secondary"} size="sm">
              {confirmed ? "Reject" : "Restore"}
            </SubmitButton>
          </ActionForm>
          <ActionForm action={deleteRegistration} confirm="Delete this registration and its payment proof permanently?">
            <input type="hidden" name="id" value={r.id} />
            <SubmitButton variant="ghost" size="sm" pendingLabel="Deleting…">
              Delete
            </SubmitButton>
          </ActionForm>
        </div>
      </div>
      <details className="mt-3 border-t border-white/5 pt-3">
        <summary className="cursor-pointer text-sm font-bold text-ink hover:text-chrome">Edit details</summary>
        <ActionForm action={updateRegistration} className="mt-3 grid gap-3 md:grid-cols-3">
          <input type="hidden" name="id" value={r.id} />
          <DetailFields r={r} />
          <div className="md:col-span-3">
            <SubmitButton size="sm">Save changes</SubmitButton>
          </div>
        </ActionForm>
      </details>
    </Card>
  );
}
