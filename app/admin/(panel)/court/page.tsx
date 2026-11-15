import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, Input, Select, Skeleton, Textarea } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { hourLabel } from "@/lib/court";
import { money } from "@/lib/format";
import { getAdminCourtConfig, publicAssetUrl, QR_PLACEHOLDER } from "@/lib/queries";
import type { CourtSettings, PlayType } from "@/lib/types";
import {
  deletePlayType,
  removeCourtQr,
  saveCourtSettings,
  savePlayType,
  uploadCourtQr,
} from "../../actions/court";

export const metadata: Metadata = { title: "Court & rates" };

export default function CourtAdminPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <CourtContent />
    </Suspense>
  );
}

async function CourtContent() {
  await requireAdmin();
  const { settings, playTypes } = await getAdminCourtConfig();
  if (!settings) return <p className="text-ink">The court_settings row is missing. Re-run the court bookings migration.</p>;

  return (
    <div className="space-y-10">
      <section>
        <h1 className="display mb-1 text-4xl">Court rental</h1>
        <p className="mb-4 text-ink">Opening hours and booking rules. Times are Manila time.</p>
        <SettingsForm s={settings} />
      </section>

      <section>
        <h2 className="display mb-1 text-3xl">Court payment QR</h2>
        <p className="mb-4 text-ink">Shown on the booking page. Separate from the tournament QR.</p>
        <QrCard path={settings.payment_qr_path} />
      </section>

      <section>
        <h2 className="display mb-1 text-3xl">Play types &amp; rates</h2>
        <p className="mb-4 text-ink">
          Each play type is a way to rent the court, charged per hour. Switch one off to hide it without losing its
          booking history. A rate of 0 shows &ldquo;price coming soon&rdquo; and can&apos;t be booked.
        </p>
        <div className="space-y-4">
          {playTypes.map((p) => (
            <PlayTypeForm key={p.id} p={p} currency={settings.currency} />
          ))}
          <details className="rounded-2xl border border-dashed border-fg/20 p-5">
            <summary className="cursor-pointer font-bold text-accent">+ Add play type</summary>
            <div className="mt-4">
              <PlayTypeForm currency={settings.currency} />
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}

function HourSelect({ name, value, from, to }: { name: string; value: number; from: number; to: number }) {
  return (
    <Select name={name} defaultValue={String(value)}>
      {Array.from({ length: to - from + 1 }, (_, i) => from + i).map((h) => (
        <option key={h} value={h}>
          {h === 24 ? "12 AM (midnight)" : hourLabel(h)}
        </option>
      ))}
    </Select>
  );
}

function SettingsForm({ s }: { s: CourtSettings }) {
  return (
    <Card className="p-5">
      <ActionForm action={saveCourtSettings} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Opens">
          <HourSelect name="open_hour" value={s.open_hour} from={0} to={23} />
        </Field>
        <Field label="Closes" hint="Last booking ends at this time.">
          <HourSelect name="close_hour" value={s.close_hour} from={1} to={24} />
        </Field>
        <Field label="Longest booking (hours)">
          <Input name="max_hours" type="number" min={1} max={12} defaultValue={s.max_hours} required />
        </Field>
        <Field label="Book up to (days ahead)">
          <Input name="days_ahead" type="number" min={1} max={90} defaultValue={s.days_ahead} required />
        </Field>
        <Field label="Currency" hint="3-letter code, e.g. PHP">
          <Input name="currency" defaultValue={s.currency} maxLength={3} required />
        </Field>
        <label className="flex items-center gap-2 self-center text-sm font-semibold">
          <input type="checkbox" name="bookings_open" defaultChecked={s.bookings_open} className="size-4 accent-ball" />
          Accept online bookings
        </label>
        <div className="sm:col-span-2 lg:col-span-3">
          <Field label="Payment instructions" hint="Shown next to the court QR code.">
            <Textarea name="payment_instructions" defaultValue={s.payment_instructions ?? ""} />
          </Field>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <SubmitButton>Save court settings</SubmitButton>
        </div>
      </ActionForm>
    </Card>
  );
}

function QrCard({ path }: { path: string | null }) {
  const url = publicAssetUrl(path);
  return (
    <Card className="grid gap-6 p-5 sm:grid-cols-[12rem_1fr]">
      <div className="rounded-xl bg-white p-2">
        <Image
          src={url ?? QR_PLACEHOLDER}
          alt="Current court payment QR"
          width={300}
          height={300}
          unoptimized
          className="aspect-square w-full object-contain"
        />
      </div>
      <div className="space-y-4">
        <Badge tone={url ? "court" : "ball"}>{url ? "Live QR" : "Placeholder in use"}</Badge>
        <ActionForm action={uploadCourtQr} className="flex flex-wrap items-end gap-3">
          <Field label="Upload QR image">
            <Input name="qr" type="file" accept="image/png,image/jpeg,image/webp" required className="pt-2" />
          </Field>
          <SubmitButton pendingLabel="Uploading…">Upload</SubmitButton>
        </ActionForm>
        {url && (
          <ActionForm action={removeCourtQr} confirm="Remove the court QR and show the placeholder?">
            <SubmitButton variant="ghost" size="sm">
              Remove QR
            </SubmitButton>
          </ActionForm>
        )}
      </div>
    </Card>
  );
}

function PlayTypeForm({ p, currency }: { p?: PlayType; currency: string }) {
  const form = (
    <>
      <ActionForm action={savePlayType} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {p && <input type="hidden" name="id" value={p.id} />}
        <Field label="Name">
          <Input name="name" defaultValue={p?.name ?? ""} placeholder="Open Play" required />
        </Field>
        <Field label="URL slug" hint="Used in /book?type=…">
          <Input name="slug" defaultValue={p?.slug ?? ""} placeholder="open-play" required />
        </Field>
        <Field label={`Rate per hour (${currency})`}>
          <Input name="rate" type="number" min={0} step="0.01" defaultValue={p ? Number(p.rate) : 0} required />
        </Field>
        <Field label="Display order">
          <Input name="sort_order" type="number" min={0} max={99} defaultValue={p?.sort_order ?? 0} />
        </Field>
        <div className="sm:col-span-2 lg:col-span-3">
          <Field label="Description">
            <Textarea name="description" defaultValue={p?.description ?? ""} className="min-h-11" />
          </Field>
        </div>
        <div className="flex flex-col justify-end gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="active" defaultChecked={p?.active ?? true} className="size-4 accent-ball" />
            Show on the site
          </label>
          <SubmitButton>{p ? "Save" : "Add play type"}</SubmitButton>
        </div>
      </ActionForm>
      {p && (
        <ActionForm action={deletePlayType} confirm={`Delete ${p.name}? This cannot be undone.`} className="mt-3">
          <input type="hidden" name="id" value={p.id} />
          <SubmitButton variant="ghost" size="sm" pendingLabel="Deleting…">
            Delete play type
          </SubmitButton>
        </ActionForm>
      )}
    </>
  );
  return p ? (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="display text-2xl">{p.name}</p>
        <Badge tone={p.active ? "court" : "neutral"}>{p.active ? "On" : "Off"}</Badge>
        <span className="text-sm font-semibold text-ink">
          {Number(p.rate) > 0 ? `${money(p.rate, currency)} / hour` : "No price yet"}
        </span>
      </div>
      {form}
    </Card>
  ) : (
    form
  );
}
