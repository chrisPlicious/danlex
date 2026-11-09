import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, Input, Select, Skeleton, Textarea } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getAdminTournament, publicAssetUrl, QR_PLACEHOLDER } from "@/lib/queries";
import type { Division, Tournament } from "@/lib/types";
import { deleteDivision, removeQr, saveDivision, saveTournament, uploadQr } from "../../actions/settings";

export const metadata: Metadata = { title: "Tournament & divisions" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <SettingsContent />
    </Suspense>
  );
}

async function SettingsContent() {
  await requireAdmin();
  const data = await getAdminTournament();

  return (
    <div className="space-y-10">
      <section>
        <h1 className="display mb-4 text-4xl">{data ? "Tournament" : "Create tournament"}</h1>
        <TournamentForm tournament={data?.tournament} />
      </section>

      {data && (
        <>
          <section>
            <h2 className="display mb-4 text-3xl">Payment QR</h2>
            <QrCard tournament={data.tournament} />
          </section>

          <section>
            <h2 className="display mb-1 text-3xl">Divisions</h2>
            <p className="mb-4 text-ink">
              Entries are unlimited. Registration stays open until you untick it or publish the bracket.
            </p>
            <div className="space-y-4">
              {data.divisions.map((d) => (
                <DivisionForm key={d.id} tournamentId={data.tournament.id} division={d} />
              ))}
              <details className="rounded-2xl border border-dashed border-fg/20 p-5">
                <summary className="cursor-pointer font-bold text-accent">+ Add division</summary>
                <div className="mt-4">
                  <DivisionForm tournamentId={data.tournament.id} />
                </div>
              </details>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function TournamentForm({ tournament: t }: { tournament?: Tournament }) {
  return (
    <Card className="p-5">
      <ActionForm action={saveTournament} className="grid gap-4 md:grid-cols-2">
        {t && <input type="hidden" name="id" value={t.id} />}
        <Field label="Name">
          <Input name="name" defaultValue={t?.name ?? "Danlex Open"} required />
        </Field>
        <Field label="URL slug">
          <Input name="slug" defaultValue={t?.slug ?? "danlex-open"} required />
        </Field>
        <Field label="Event date">
          <Input name="event_date" type="date" defaultValue={t?.event_date ?? ""} />
        </Field>
        <Field label="Venue">
          <Input name="venue" defaultValue={t?.venue ?? "Danlex Pickle Court"} />
        </Field>
        <Field label="Currency" hint="3-letter code, e.g. PHP">
          <Input name="currency" defaultValue={t?.currency ?? "PHP"} maxLength={3} required />
        </Field>
        <Field label="Status" hint="Registration only works while Open. Draft hides the tournament.">
          <Select name="status" defaultValue={t?.status ?? "open"}>
            <option value="draft">Draft (hidden)</option>
            <option value="open">Open</option>
            <option value="closed">Registration closed</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
          </Select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Payment instructions" hint="Shown next to the QR code.">
            <Textarea name="payment_instructions" defaultValue={t?.payment_instructions ?? ""} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Description">
            <Textarea name="description" defaultValue={t?.description ?? ""} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <SubmitButton>{t ? "Save tournament" : "Create tournament"}</SubmitButton>
        </div>
      </ActionForm>
    </Card>
  );
}

function QrCard({ tournament: t }: { tournament: Tournament }) {
  const url = publicAssetUrl(t.payment_qr_path);
  return (
    <Card className="grid gap-6 p-5 sm:grid-cols-[12rem_1fr]">
      <div className="rounded-xl bg-white p-2">
        <Image
          src={url ?? QR_PLACEHOLDER}
          alt="Current payment QR"
          width={300}
          height={300}
          unoptimized
          className="aspect-square w-full object-contain"
        />
      </div>
      <div className="space-y-4">
        <Badge tone={url ? "court" : "ball"}>{url ? "Live QR" : "Placeholder in use"}</Badge>
        <ActionForm action={uploadQr} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="tournament_id" value={t.id} />
          <Field label="Upload QR image">
            <Input name="qr" type="file" accept="image/png,image/jpeg,image/webp" required className="pt-2" />
          </Field>
          <SubmitButton pendingLabel="Uploading…">Upload</SubmitButton>
        </ActionForm>
        {url && (
          <ActionForm action={removeQr} confirm="Remove the QR and show the placeholder?">
            <input type="hidden" name="tournament_id" value={t.id} />
            <SubmitButton variant="ghost" size="sm">
              Remove QR
            </SubmitButton>
          </ActionForm>
        )}
      </div>
    </Card>
  );
}

function DivisionForm({ tournamentId, division: d }: { tournamentId: string; division?: Division }) {
  const f = d?.match_format ?? { games_to_win: 1, points_to: 11, win_by: 2 };
  const inner = (
    <>
      <ActionForm action={saveDivision} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {d && <input type="hidden" name="id" value={d.id} />}
        <input type="hidden" name="tournament_id" value={tournamentId} />
        <Field label="Name" hint={d ? `${d.confirmed_count} confirmed` : undefined}>
          <Input name="name" defaultValue={d?.name ?? ""} placeholder="Men's Doubles" required />
        </Field>
        <Field label="Type">
          <Select name="kind" defaultValue={d?.kind ?? "doubles"} disabled={!!d && d.confirmed_count > 0}>
            <option value="singles">Singles</option>
            <option value="doubles">Doubles</option>
          </Select>
          {d && d.confirmed_count > 0 && <input type="hidden" name="kind" value={d.kind} />}
        </Field>
        <Field label="Entry fee">
          <Input name="fee" type="number" min={0} step="0.01" defaultValue={d ? Number(d.fee) : 0} required />
        </Field>
        <Field label="Games per match">
          <Select name="games_to_win" defaultValue={String(f.games_to_win)}>
            <option value="1">1 game</option>
            <option value="2">Best of 3</option>
            <option value="3">Best of 5</option>
          </Select>
        </Field>
        <Field label="Points to win">
          <Select name="points_to" defaultValue={String(f.points_to)}>
            {[7, 9, 11, 15, 21].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Win by">
          <Select name="win_by" defaultValue={String(f.win_by)}>
            <option value="2">2</option>
            <option value="1">1</option>
          </Select>
        </Field>
        <Field label="Display order">
          <Input name="sort_order" type="number" min={0} max={99} defaultValue={d?.sort_order ?? 0} />
        </Field>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="registration_open" defaultChecked={d?.registration_open ?? true} className="size-4 accent-ball" />
          Registration open
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="grand_final_reset" defaultChecked={d?.grand_final_reset ?? true} className="size-4 accent-ball" />
          Grand final reset
        </label>
        <div className="flex items-center sm:col-span-2 lg:col-span-2 lg:justify-end">
          <SubmitButton>{d ? "Save division" : "Add division"}</SubmitButton>
        </div>
      </ActionForm>
      {d && (
        <ActionForm action={deleteDivision} confirm={`Delete ${d.name}? This cannot be undone.`} className="mt-3">
          <input type="hidden" name="id" value={d.id} />
          <SubmitButton variant="ghost" size="sm" pendingLabel="Deleting…">
            Delete division
          </SubmitButton>
        </ActionForm>
      )}
    </>
  );
  return d ? (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-3">
        <p className="display text-2xl">{d.name}</p>
        <Badge tone={d.kind === "singles" ? "electric" : "magenta"}>{d.kind}</Badge>
      </div>
      {inner}
    </Card>
  ) : (
    inner
  );
}
