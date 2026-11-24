"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { ticketClass } from "@/components/club";
import { spotsLine } from "@/components/session-cards";
import { Alert, Button, cn, Field, Input } from "@/components/ui";
import { useSessionVersion } from "@/components/use-session-version";
import { bookingWhen, money } from "@/lib/format";
import { HOLD_MINUTES, LEVELS } from "@/lib/open-play";
import { browserClient } from "@/lib/supabase/browser";
import type { Level, PublicSession } from "@/lib/types";
import { joinSession, releaseSignupHold } from "../actions";
import type { Payee } from "@/lib/payee";
import { PayPanel, type PayTicket } from "../pay-panel";

const STEPS = ["Your details", "Pay"] as const;

export function JoinWizard({
  initial,
  currency,
  qrUrl,
  instructions,
  payee,
}: {
  initial: PublicSession;
  currency: string;
  qrUrl: string;
  instructions: string | null;
  payee: Payee;
}) {
  const router = useRouter();
  const [session, setSession] = useState(initial);
  const [details, setDetails] = useState({ name: "", phone: "", email: "", website: "" });
  const [level, setLevel] = useState<Level | null>(null);
  const [ticket, setTicket] = useState<PayTicket | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // spots left move as other players join, pay or drop out
  const reload = useCallback(() => {
    browserClient()
      .rpc("get_sessions_public", { p_session_id: initial.id })
      .then(({ data }: { data: unknown }) => {
        const next = (data as PublicSession[] | null)?.[0];
        if (next) setSession(next);
      });
  }, [initial.id]);
  useSessionVersion(initial.id, reload);

  const full = session.spots_left <= 0;
  const step = ticket ? 1 : 0;

  function submit() {
    const errs: Record<string, string> = {};
    if (details.name.trim().length < 2) errs.name = "Enter your full name";
    if (!/^[0-9+()\-\s]{7,20}$/.test(details.phone.trim())) errs.phone = "Enter a valid mobile number";
    if (!/^\S+@\S+\.\S+$/.test(details.email.trim())) errs.email = "Enter a valid email";
    if (!level) errs.level = "Pick your level";
    setFieldErrors(errs);
    if (Object.keys(errs).length || !level) return;
    setError(null);
    startTransition(async () => {
      const res = await joinSession({
        sessionId: session.id,
        name: details.name,
        phone: details.phone,
        email: details.email.trim(),
        level,
        website: details.website,
      });
      if (!res.ok) {
        if (res.fields) setFieldErrors(res.fields);
        setError(res.error);
        reload();
        return;
      }
      if (res.status === "waitlisted") {
        router.push(`/play/s/${res.code}`);
        return;
      }
      // count down on the local clock from the time left the server measured
      setTicket({ signupId: res.signupId, holdToken: res.holdToken, amount: res.amount, expiresAt: Date.now() + res.msLeft });
    });
  }

  function startOver() {
    if (ticket) void releaseSignupHold(ticket.signupId, ticket.holdToken).then(reload);
    setTicket(null);
    setError(null);
  }

  if (!session.signups_open) {
    return <Alert tone="ball">Sign-ups for this session are closed.</Alert>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="min-w-0">
        <ol className="mb-6 flex gap-2" aria-label="Progress">
          {STEPS.map((label, i) => (
            <li
              key={label}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "flex flex-1 items-center gap-2 rounded-md px-3 py-2 text-sm font-bold",
                i === step ? "bg-ball text-pine-950" : i < step ? "bg-panel text-court" : "bg-panel text-ink",
              )}
            >
              <span className="score text-lg">{i + 1}</span>
              <span className="truncate">{label}</span>
            </li>
          ))}
        </ol>

        <div className="rounded-md bg-panel p-5 sm:p-6">
          {ticket ? (
            <PayPanel
              ticket={ticket}
              currency={currency}
              qrUrl={qrUrl}
              instructions={instructions}
              payee={payee}
              onStartOver={startOver}
            />
          ) : (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="space-y-5"
            >
              <h2 className="display text-2xl">{full ? "Join the waitlist" : "Grab a spot"}</h2>
              {full && (
                <Alert tone="ball">
                  This session is full. Join the waitlist: if a spot opens up more than 30 minutes before the start,
                  we&apos;ll email you a link to pay and claim it.
                </Alert>
              )}
              <Field label="Full name" error={fieldErrors.name}>
                <Input
                  autoComplete="name"
                  value={details.name}
                  onChange={(e) => setDetails((d) => ({ ...d, name: e.target.value }))}
                />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Mobile number" hint="One spot per number." error={fieldErrors.phone}>
                  <Input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={details.phone}
                    onChange={(e) => setDetails((d) => ({ ...d, phone: e.target.value }))}
                  />
                </Field>
                <Field label="Email" hint="Your code and any waitlist offer go here." error={fieldErrors.email}>
                  <Input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={details.email}
                    onChange={(e) => setDetails((d) => ({ ...d, email: e.target.value }))}
                  />
                </Field>
              </div>
              <fieldset>
                <legend className="mb-1.5 text-sm font-semibold text-fg">Your level</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {LEVELS.map((l) => (
                    <button
                      key={l.value}
                      type="button"
                      aria-pressed={level === l.value}
                      onClick={() => setLevel(l.value)}
                      className={cn(
                        "rounded-md border-2 bg-well p-3 text-left transition",
                        level === l.value ? "border-ball" : "border-transparent hover:border-ball/60",
                      )}
                    >
                      <span className="block font-bold">{l.label}</span>
                      <span className="mt-0.5 block text-xs text-ink">{l.hint}</span>
                    </button>
                  ))}
                </div>
                {fieldErrors.level ? (
                  <p className="mt-1 text-xs font-semibold text-danger">{fieldErrors.level}</p>
                ) : (
                  <p className="mt-1 text-xs text-ink">Used to mix games evenly. Be honest — it makes better games.</p>
                )}
              </fieldset>
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
                {full
                  ? "Nothing to pay until a spot is offered to you."
                  : `Next we hold your spot for ${HOLD_MINUTES} minutes while you pay.`}
              </p>
              {error && <Alert>{error}</Alert>}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link href="/play/s" className="text-sm font-semibold text-ink hover:text-fg">
                  Already signed up?
                </Link>
                <Button type="submit" size="lg" disabled={pending}>
                  {pending ? "Saving…" : full ? "Join the waitlist" : "Hold my spot & pay"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>

      <aside className={ticketClass("flame", "h-fit space-y-4 lg:sticky lg:top-20")}>
        <p className="text-sm font-bold">Open play</p>
        <p className="display text-3xl text-pine-900">{session.title}</p>
        <dl className="space-y-1 border-t border-dashed border-pine-900/40 pt-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt>When</dt>
            <dd className="text-right font-bold">{bookingWhen(session.starts_at, session.ends_at)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Spots</dt>
            <dd className="text-right font-bold">{spotsLine(session)}</dd>
          </div>
          {session.level_note && (
            <div className="flex justify-between gap-3">
              <dt>Level</dt>
              <dd className="text-right font-bold">{session.level_note}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-3 border-t border-dashed border-pine-900/40 pt-2">
            <dt>Fee</dt>
            <dd className="score text-right text-2xl text-pine-900">{money(ticket?.amount ?? session.fee, currency)}</dd>
          </div>
        </dl>
        {session.notes && <p className="text-sm whitespace-pre-line">{session.notes}</p>}
      </aside>
    </div>
  );
}
