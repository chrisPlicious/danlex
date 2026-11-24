import { Field, Input, Select, Textarea } from "@/components/ui";
import { courtParts, KIND_LABEL, MAX_GAMES, PARTNER_MODES, TIEBREAKS } from "@/lib/open-play";
import type { Session } from "@/lib/types";

/** Shared fields of the new-session and edit-session forms. Times are court time (Manila). */
export function SessionFields({ s, defaultDay, defaultFee }: { s?: Session; defaultDay: string; defaultFee?: number }) {
  const start = s ? courtParts(s.starts_at) : null;
  const end = s ? courtParts(s.ends_at) : null;
  return (
    <>
      <input type="hidden" name="id" value={s?.id ?? ""} />
      <Field label="Title">
        <Input name="title" defaultValue={s?.title ?? "Open Play"} maxLength={60} required />
      </Field>
      <Field label="Kind">
        <Select name="kind" defaultValue={s?.kind ?? "open_play"}>
          {(Object.keys(KIND_LABEL) as Session["kind"][]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Date">
        <Input type="date" name="day" defaultValue={start?.day ?? defaultDay} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts">
          <Input type="time" name="start" step={900} defaultValue={start?.time ?? "18:00"} required />
        </Field>
        <Field label="Ends">
          <Input type="time" name="end" step={900} defaultValue={end?.time ?? "20:00"} required />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Players" hint="4–64">
          <Input type="number" name="capacity" min={4} max={64} defaultValue={s?.capacity ?? 16} required />
        </Field>
        <Field label="Fee per player">
          <Input type="number" name="fee" min={1} step="0.01" defaultValue={s ? Number(s.fee) : (defaultFee ?? 150)} required />
        </Field>
      </div>
      <Field label="Level note" hint="Shown on the card, e.g. “All levels” or “3.0+”.">
        <Input name="level_note" defaultValue={s?.level_note ?? ""} maxLength={60} />
      </Field>
      <div className="md:col-span-2">
        <Field label="Notes for players">
          <Textarea name="notes" defaultValue={s?.notes ?? ""} className="min-h-11" placeholder="Bring water, paddles available to borrow…" />
        </Field>
      </div>
      <label className="flex items-center gap-2 self-end pb-3 text-sm font-semibold">
        <input type="checkbox" name="signups_open" defaultChecked={s?.signups_open ?? true} className="size-4 accent-[var(--color-ball)]" />
        Sign-ups open
      </label>
      <Field
        label="Partners"
        hint={`Random: new partner every game, wins and losses per player. Fixed: you pair players up. Locked once a game is played. Max ${MAX_GAMES} games each.`}
      >
        <Select name="partner_mode" defaultValue={s?.partner_mode ?? "random"}>
          {PARTNER_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="md:col-span-2">
        <Field
          label="Tiebreak (level on wins and losses)"
          hint="Fastest wins: lower average time of the games they won. Last two losses: lower total of their own points in their two most recent losses. Still level? The other one decides."
        >
          <Select name="tiebreak" defaultValue={s?.tiebreak ?? "win_time"}>
            {TIEBREAKS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </>
  );
}
