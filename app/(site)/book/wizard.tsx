"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ticketClass } from "@/components/club";
import { Alert, Badge, Button, cn, Field, Input } from "@/components/ui";
import { compressImage } from "@/lib/compress-image";
import { bookableDays, daySlots, hourLabel, maxHoursFrom } from "@/lib/court";
import { dayLabel, money } from "@/lib/format";
import { isPaymentRef, PAYMENT_REF_ERROR, pastedPaymentRef, typedPaymentRef } from "@/lib/payment-ref";
import { browserClient } from "@/lib/supabase/browser";
import type { BusyInterval, CourtSettings, PlayType } from "@/lib/types";
import { completeBooking, holdBooking, startBookingProofUpload } from "./actions";

const STEPS = ["Play", "Time", "Details", "Pay"] as const;
const HOLD_MS = 15 * 60 * 1000;
const WEEKDAY = new Intl.DateTimeFormat("en-PH", { weekday: "short", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "UTC" });

type Hold = { bookingId: string; holdToken: string; amount: number; expiresAt: number };

export function BookingWizard({
  settings,
  playTypes,
  tournamentDays,
  initialSlug,
  now,
  qrUrl,
}: {
  settings: CourtSettings;
  playTypes: PlayType[];
  tournamentDays: string[];
  initialSlug?: string;
  now: string;
  qrUrl: string;
}) {
  const router = useRouter();
  const preset = playTypes.find((p) => p.slug === initialSlug);

  const [step, setStep] = useState(preset ? 1 : 0);
  const [playTypeId, setPlayTypeId] = useState<string | null>(preset?.id ?? null);
  const [nowMs, setNowMs] = useState(() => Date.parse(now));

  const blocked = useMemo(() => new Set(tournamentDays), [tournamentDays]);
  const days = useMemo(() => bookableDays(settings, new Date(nowMs)), [settings, nowMs]);
  const [day, setDay] = useState(() => days.find((d) => !blocked.has(d)) ?? days[0]);
  const [hour, setHour] = useState<number | null>(null);
  const [hours, setHours] = useState(1);

  const [busy, setBusy] = useState<{ day: string; intervals: BusyInterval[] } | null>(null);
  const [busyError, setBusyError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  const [details, setDetails] = useState({ name: "", phone: "", website: "" });
  const [hold, setHold] = useState<Hold | null>(null);
  const [pay, setPay] = useState({ email: "", paymentRef: "" });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState<string | null>(null);

  // free/taken hours for the chosen day; anonymous visitors only ever see busy intervals
  useEffect(() => {
    let cancelled = false;
    browserClient()
      .rpc("get_court_busy", { p_day: day })
      .then(({ data, error: rpcError }: { data: unknown; error: unknown }) => {
        if (cancelled) return;
        if (rpcError) return setBusyError("Couldn't load free times. Please refresh the page.");
        setBusyError(null);
        setBusy({ day, intervals: (data ?? []) as BusyInterval[] });
      });
    return () => {
      cancelled = true;
    };
  }, [day, refresh]);

  // clock: every second while a hold counts down, otherwise twice a minute so past hours close
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), hold ? 1000 : 30_000);
    return () => clearInterval(id);
  }, [hold]);

  // keep availability fresh while they're choosing
  useEffect(() => {
    if (step !== 1) return;
    const id = setInterval(() => setRefresh((r) => r + 1), 30_000);
    return () => clearInterval(id);
  }, [step]);

  const playType = playTypes.find((p) => p.id === playTypeId) ?? null;
  const tournamentDay = blocked.has(day);
  const loadingSlots = !tournamentDay && busy?.day !== day;
  const slots = useMemo(
    () => (busy && busy.day === day && !tournamentDay ? daySlots(day, settings, busy.intervals, new Date(nowMs)) : []),
    [busy, day, tournamentDay, settings, nowMs],
  );
  const maxHere = hour === null ? 0 : maxHoursFrom(slots, hour, settings);
  const timeOk = hour !== null && hours >= 1 && hours <= maxHere;
  const amount = hold ? hold.amount : playType ? Number(playType.rate) * hours : 0;
  const msLeft = hold ? hold.expiresAt - nowMs : 0;

  function pickDay(d: string) {
    setDay(d);
    setHour(null);
    setHours(1);
    setError(null);
  }

  function pickHour(h: number) {
    setHour(h);
    setHours((n) => Math.max(1, Math.min(n, maxHoursFrom(slots, h, settings))));
    setError(null);
  }

  function choose(next: File | null) {
    setError(null);
    setFile(next);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return next ? URL.createObjectURL(next) : null;
    });
  }

  function startOver() {
    // the abandoned hold simply lapses after 15 minutes
    setHold(null);
    choose(null);
    setPay({ email: "", paymentRef: "" });
    setHour(null);
    setHours(1);
    setError(null);
    setFieldErrors({});
    setStep(1);
    setRefresh((r) => r + 1);
  }

  function submitHold() {
    const errs: Record<string, string> = {};
    if (details.name.trim().length < 2) errs.name = "Enter your full name";
    if (!/^[0-9+()\-\s]{7,20}$/.test(details.phone.trim())) errs.phone = "Enter a valid mobile number";
    setFieldErrors(errs);
    if (Object.keys(errs).length || !playType || hour === null) return;
    setError(null);
    startTransition(async () => {
      const res = await holdBooking({
        playTypeId: playType.id,
        day,
        hour,
        hours,
        name: details.name,
        phone: details.phone,
        website: details.website,
      });
      if (!res.ok) {
        if (res.fields) setFieldErrors(res.fields);
        setError(res.error);
        if (res.retime) {
          setHour(null);
          setStep(1);
          setRefresh((r) => r + 1);
        }
        return;
      }
      // count down on the local clock so a skewed device clock can't shorten or stretch the hold
      setHold({ bookingId: res.bookingId, holdToken: res.holdToken, amount: res.amount, expiresAt: Date.now() + HOLD_MS });
      setNowMs(Date.now());
      setStep(3);
    });
  }

  function submitPay() {
    if (!hold) return;
    const email = pay.email.trim();
    const errs: Record<string, string> = {};
    if (!isPaymentRef(pay.paymentRef)) errs.paymentRef = PAYMENT_REF_ERROR;
    if (email && !/^\S+@\S+\.\S+$/.test(email)) errs.email = "Enter a valid email, or leave it blank";
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    if (!file) return setError("Please choose your payment screenshot.");
    setError(null);
    startTransition(async () => {
      try {
        setPhase("Preparing image…");
        const blob = await compressImage(file);

        setPhase("Reserving upload…");
        const ticket = await startBookingProofUpload(hold.bookingId, hold.holdToken);
        if (!ticket.ok) return setError(ticket.error);

        setPhase("Uploading receipt…");
        const { error: upErr } = await browserClient()
          .storage.from("payment-proofs")
          .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: "image/jpeg" });
        if (upErr) return setError("Upload failed. Check your connection and try again.");

        setPhase("Confirming your booking…");
        const result = await completeBooking({
          bookingId: hold.bookingId,
          holdToken: hold.holdToken,
          email,
          paymentRef: pay.paymentRef,
          proofPath: ticket.path,
        });
        if (!result.ok) {
          if ("fields" in result && result.fields) setFieldErrors(result.fields);
          return setError(result.error);
        }
        router.push(`/book/success/${result.code}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      } finally {
        setPhase(null);
      }
    });
  }

  const timeLabel = hour === null ? null : `${hourLabel(hour)} – ${hourLabel(hour + hours)}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="min-w-0">
        <ol className="mb-6 flex gap-2" aria-label="Progress">
          {STEPS.map((label, i) => (
            <li
              key={label}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "flex flex-1 items-center gap-2 rounded-md px-2 py-2 text-sm font-bold sm:px-3",
                i === step ? "bg-ball text-pine-950" : i < step ? "bg-panel text-court" : "bg-panel text-ink",
              )}
            >
              <span className="score text-lg">{i + 1}</span>
              <span className="truncate">{label}</span>
            </li>
          ))}
        </ol>

        <div className="rounded-md bg-panel p-5 sm:p-6">
          {step === 0 && (
            <div className="space-y-5">
              <h2 className="display text-2xl">How do you want to play?</h2>
              <div className="grid gap-3">
                {playTypes.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPlayTypeId(p.id);
                      setError(null);
                      setStep(1);
                    }}
                    className={cn(
                      "flex items-center justify-between gap-4 rounded-md border-2 bg-well p-4 text-left transition",
                      p.id === playTypeId ? "border-ball" : "border-transparent hover:border-ball/60",
                    )}
                  >
                    <span>
                      <span className="display block text-2xl">{p.name}</span>
                      {p.description && <span className="mt-1 block text-sm text-ink">{p.description}</span>}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="score block text-2xl text-accent">{money(p.rate, settings.currency)}</span>
                      <span className="text-xs font-semibold text-ink">per hour</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="display mb-3 text-2xl">Pick a day</h2>
                <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2">
                  {days.map((d) => {
                    const closed = blocked.has(d);
                    const date = new Date(`${d}T00:00:00Z`);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => pickDay(d)}
                        aria-pressed={d === day}
                        className={cn(
                          "flex w-18 shrink-0 snap-start flex-col items-center rounded-md px-2 py-2.5 transition",
                          d === day ? "bg-ball text-pine-950" : "bg-well text-fg hover:bg-fg/10",
                          closed && d !== day && "opacity-50",
                        )}
                      >
                        <span className="text-xs font-bold uppercase tracking-wider">{WEEKDAY.format(date)}</span>
                        <span className="score text-2xl">{date.getUTCDate()}</span>
                        <span className={cn("text-xs font-semibold uppercase", d === day ? "text-pine-900" : "text-ink")}>
                          {MONTH.format(date)}
                        </span>
                        {closed && (
                          <span className={cn("text-[10px] font-bold uppercase", d === day ? "text-pine-900" : "text-magenta-soft")}>
                            Tournament
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <h2 className="display mb-3 text-2xl">Start time</h2>
                {tournamentDay ? (
                  <Alert tone="ball">The court is closed for a tournament on {dayLabel(day)}. Please pick another day.</Alert>
                ) : busyError ? (
                  <Alert>{busyError}</Alert>
                ) : loadingSlots ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {Array.from({ length: 8 }, (_, i) => (
                      <div key={i} className="h-12 animate-pulse rounded-md bg-fg/5" />
                    ))}
                  </div>
                ) : slots.every((s) => !s.free) ? (
                  <Alert tone="ball">No free times left on {dayLabel(day)}. Please pick another day.</Alert>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {slots.map((s) => {
                      const inRange = hour !== null && s.hour >= hour && s.hour < hour + hours;
                      return (
                        <button
                          key={s.hour}
                          type="button"
                          disabled={!s.free}
                          onClick={() => pickHour(s.hour)}
                          aria-pressed={inRange}
                          className={cn(
                            "h-12 rounded-md text-sm font-bold transition",
                            inRange
                              ? "bg-ball text-pine-950"
                              : s.free
                                ? "bg-well text-fg hover:bg-fg/10"
                                : "cursor-not-allowed text-ink/50 line-through",
                          )}
                        >
                          {hourLabel(s.hour)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {hour !== null && maxHere > 0 && (
                <div>
                  <h2 className="display mb-3 text-2xl">How long?</h2>
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: maxHere }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setHours(n)}
                        aria-pressed={n === hours}
                        className={cn(
                          "h-11 rounded-md px-4 text-sm font-bold transition",
                          n === hours ? "bg-ball text-pine-950" : "bg-well text-fg hover:bg-fg/10",
                        )}
                      >
                        {n} {n === 1 ? "hour" : "hours"}
                      </button>
                    ))}
                  </div>
                  {maxHere < settings.max_hours && (
                    <p className="mt-2 text-xs text-ink">
                      Up to {maxHere} {maxHere === 1 ? "hour" : "hours"} from {hourLabel(hour)} — the next hour is taken or
                      the court closes.
                    </p>
                  )}
                </div>
              )}
              {hour !== null && !timeOk && !loadingSlots && (
                <Alert tone="ball">That time was just taken. Please pick another.</Alert>
              )}

              <div className="flex justify-between gap-3">
                <Button variant="ghost" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button size="lg" disabled={!timeOk || !playType} onClick={() => setStep(2)}>
                  Continue
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                submitHold();
              }}
              className="space-y-5"
            >
              <h2 className="display text-2xl">Your details</h2>
              <Field label="Full name" error={fieldErrors.name}>
                <Input
                  autoComplete="name"
                  value={details.name}
                  onChange={(e) => setDetails((d) => ({ ...d, name: e.target.value }))}
                />
              </Field>
              <Field label="Mobile number" hint="We'll text you if anything changes." error={fieldErrors.phone}>
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={details.phone}
                  onChange={(e) => setDetails((d) => ({ ...d, phone: e.target.value }))}
                />
              </Field>
              {/* honeypot */}
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden
                className="hidden"
                value={details.website}
                onChange={(e) => setDetails((d) => ({ ...d, website: e.target.value }))}
              />
              <p className="text-sm text-ink">
                Next we hold {timeLabel ? <strong className="text-fg">{timeLabel}</strong> : "your time"} for 15 minutes
                while you pay.
              </p>
              <div className="flex justify-between gap-3">
                <Button type="button" variant="ghost" onClick={() => setStep(1)} disabled={pending}>
                  Back
                </Button>
                <Button type="submit" size="lg" disabled={pending || !timeOk}>
                  {pending ? "Holding your time…" : "Hold my time & pay"}
                </Button>
              </div>
            </form>
          )}

          {step === 3 && hold && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="display text-2xl">Scan &amp; pay</h2>
                {msLeft > 0 ? (
                  <Badge tone="court">
                    Held for {Math.floor(msLeft / 60000)}:{String(Math.floor((msLeft % 60000) / 1000)).padStart(2, "0")}
                  </Badge>
                ) : (
                  <Badge tone="ball">Hold ran out</Badge>
                )}
              </div>
              {msLeft <= 0 && (
                <Alert tone="ball">
                  Your 15-minute hold ran out. You can still upload your receipt — if the time is still free, it&apos;s
                  yours. If someone else took it, we&apos;ll contact you to refund or rebook.
                </Alert>
              )}
              <div className="grid items-center gap-6 sm:grid-cols-[14rem_1fr]">
                <div className="rounded-md bg-white p-3 shadow-[0_0_0_4px_var(--color-ball)]">
                  <Image
                    src={qrUrl}
                    alt="Payment QR code"
                    width={400}
                    height={400}
                    unoptimized
                    className="aspect-square w-full object-contain"
                  />
                </div>
                <div className="space-y-3">
                  <p className="text-sm uppercase tracking-wider text-ink">Amount due</p>
                  <p className="score text-5xl text-accent">{money(amount, settings.currency)}</p>
                  <p className="text-ink">
                    {settings.payment_instructions ||
                      "Scan the QR code with your e-wallet or banking app and pay the exact amount. Take a screenshot of the successful payment and upload it below."}
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Last 6 digits of your reference number"
                  hint="It's on your payment receipt. Numbers only."
                  error={fieldErrors.paymentRef}
                >
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    required
                    placeholder="123456"
                    value={pay.paymentRef}
                    onChange={(e) => setPay((p) => ({ ...p, paymentRef: typedPaymentRef(e.target.value) }))}
                    onPaste={(e) => {
                      e.preventDefault();
                      const pasted = pastedPaymentRef(e.clipboardData.getData("text"));
                      setPay((p) => ({ ...p, paymentRef: pasted }));
                    }}
                  />
                </Field>
                <Field label="Email (optional)" hint="We'll email your booking code." error={fieldErrors.email}>
                  <Input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={pay.email}
                    onChange={(e) => setPay((p) => ({ ...p, email: e.target.value }))}
                  />
                </Field>
              </div>
              <label
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed p-6 text-center transition",
                  file ? "border-court/60 bg-court/5" : "border-fg/40 hover:border-ball hover:bg-ball/5",
                )}
              >
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Selected payment screenshot" className="max-h-72 rounded-lg object-contain" />
                ) : (
                  <span className="display text-xl text-ink">Tap to choose screenshot</span>
                )}
                <span className="text-sm font-semibold text-fg">{file ? file.name : "JPG, PNG or WebP"}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  className="sr-only"
                  onChange={(e) => choose(e.target.files?.[0] ?? null)}
                />
              </label>

              {error && <Alert>{error}</Alert>}

              <div className="flex justify-between gap-3">
                <Button variant="ghost" onClick={startOver} disabled={pending}>
                  Start over
                </Button>
                <Button size="lg" onClick={submitPay} disabled={pending || !file}>
                  {pending ? (phase ?? "Submitting…") : "Submit & confirm booking"}
                </Button>
              </div>
            </div>
          )}

          {step !== 3 && error && (
            <div className="mt-5">
              <Alert>{error}</Alert>
            </div>
          )}
        </div>
      </div>

      <aside className={ticketClass("flame", "h-fit space-y-4 lg:sticky lg:top-20")}>
        <p className="text-sm font-bold">Court rental</p>
        <p className="display text-3xl text-pine-900">{playType?.name ?? "Pick a play type"}</p>
        <dl className="space-y-1 border-t border-dashed border-pine-900/40 pt-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt>Date</dt>
            <dd className="text-right font-bold">{dayLabel(day)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Time</dt>
            <dd className="text-right font-bold">{timeLabel ?? "—"}</dd>
          </div>
          {playType && (
            <div className="flex justify-between gap-3">
              <dt>Rate</dt>
              <dd className="text-right font-bold">{money(playType.rate, settings.currency)} / hour</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-3 border-t border-dashed border-pine-900/40 pt-2">
            <dt>Total</dt>
            <dd className="score text-right text-2xl text-pine-900">
              {hour === null || !playType ? "—" : money(amount, settings.currency)}
            </dd>
          </div>
        </dl>
        <p className="text-xs">
          Court hours {hourLabel(settings.open_hour)} – {hourLabel(settings.close_hour)}. Up to {settings.max_hours}{" "}
          {settings.max_hours === 1 ? "hour" : "hours"} per booking.
        </p>
      </aside>
    </div>
  );
}
