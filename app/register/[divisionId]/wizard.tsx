"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Alert, Badge, Button, cn, Field, Input, SlotMeter } from "@/components/ui";
import { useLiveDivisions } from "@/components/use-live-divisions";
import { compressImage } from "@/lib/compress-image";
import { money } from "@/lib/format";
import { browserClient } from "@/lib/supabase/browser";
import { isAcceptingEntries, slotsLeft, type Division, type Tournament } from "@/lib/types";
import { completeRegistration, startProofUpload, type RegistrationInput } from "../actions";

type Details = Omit<RegistrationInput, "divisionId" | "kind" | "proofPath">;

const STEPS = ["Details", "Pay", "Upload"] as const;

export function RegistrationWizard({
  tournament,
  division: initialDivision,
  qrUrl,
}: {
  tournament: Tournament;
  division: Division;
  qrUrl: string;
}) {
  const [division] = useLiveDivisions([initialDivision]);
  const doubles = division.kind === "doubles";
  const accepting = isAcceptingEntries(tournament, division);
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [details, setDetails] = useState<Details>({
    player1Name: "",
    player1Phone: "",
    player1Email: "",
    player2Name: "",
    player2Phone: "",
    player2Email: "",
    teamName: "",
    paymentRef: "",
    website: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const set = (key: keyof Details) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDetails((d) => ({ ...d, [key]: e.target.value }));

  function validateDetails(): boolean {
    const errs: Record<string, string> = {};
    if (details.player1Name.trim().length < 2) errs.player1Name = "Enter your full name";
    if (!/^[0-9+()\-\s]{7,20}$/.test(details.player1Phone.trim())) errs.player1Phone = "Enter a valid mobile number";
    if (!/^\S+@\S+\.\S+$/.test(details.player1Email.trim())) errs.player1Email = "Enter a valid email";
    if (doubles && (details.player2Name ?? "").trim().length < 2) errs.player2Name = "Enter your partner's name";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function submit() {
    if (!file) return setError("Please choose your payment screenshot.");
    setError(null);
    startTransition(async () => {
      try {
        setPhase("Preparing image…");
        const blob = await compressImage(file);

        setPhase("Reserving upload…");
        const ticket = await startProofUpload(division.id);
        if (!ticket.ok) return setError(ticket.error);

        setPhase("Uploading receipt…");
        const { error: upErr } = await browserClient()
          .storage.from("payment-proofs")
          .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: "image/jpeg" });
        if (upErr) return setError("Upload failed. Check your connection and try again.");

        setPhase("Locking your slot…");
        const result = await completeRegistration({
          ...details,
          divisionId: division.id,
          kind: division.kind,
          proofPath: ticket.path,
        });
        if (!result.ok) {
          if ("fields" in result && result.fields) {
            setFieldErrors(result.fields);
            setStep(0);
          }
          return setError(result.error);
        }
        router.push(`/register/success/${result.code}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      } finally {
        setPhase(null);
      }
    });
  }

  const accent = doubles ? "magenta" : "electric";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div>
        <ol className="mb-6 flex gap-2" aria-label="Progress">
          {STEPS.map((label, i) => (
            <li
              key={label}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold",
                i === step ? "border-ball bg-ball/10 text-ball" : i < step ? "border-court/40 text-court" : "border-white/10 text-ink",
              )}
            >
              <span className="display text-lg">{i + 1}</span>
              {label}
            </li>
          ))}
        </ol>

        {!accepting && (
          <div className="mb-6">
            <Alert>
              {slotsLeft(division) === 0
                ? "All slots in this division are taken. Registration is closed."
                : "Registration for this division is closed."}
            </Alert>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-navy-900/70 p-5 sm:p-6">
          {step === 0 && (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (validateDetails()) setStep(1);
              }}
              className="space-y-5"
            >
              <fieldset className="space-y-4">
                <legend className="display mb-2 text-2xl">{doubles ? "Player 1" : "Your details"}</legend>
                <Field label="Full name" error={fieldErrors.player1Name}>
                  <Input autoComplete="name" value={details.player1Name} onChange={set("player1Name")} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Mobile number" error={fieldErrors.player1Phone}>
                    <Input type="tel" inputMode="tel" autoComplete="tel" value={details.player1Phone} onChange={set("player1Phone")} />
                  </Field>
                  <Field label="Email" error={fieldErrors.player1Email}>
                    <Input type="email" autoComplete="email" value={details.player1Email} onChange={set("player1Email")} />
                  </Field>
                </div>
              </fieldset>

              {doubles && (
                <fieldset className="space-y-4 border-t border-white/10 pt-5">
                  <legend className="display mb-2 text-2xl">Partner</legend>
                  <Field label="Partner's full name" error={fieldErrors.player2Name}>
                    <Input value={details.player2Name ?? ""} onChange={set("player2Name")} />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Partner's mobile (optional)" error={fieldErrors.player2Phone}>
                      <Input type="tel" inputMode="tel" value={details.player2Phone ?? ""} onChange={set("player2Phone")} />
                    </Field>
                    <Field label="Partner's email (optional)" error={fieldErrors.player2Email}>
                      <Input type="email" value={details.player2Email ?? ""} onChange={set("player2Email")} />
                    </Field>
                  </div>
                  <Field label="Team name (optional)" hint="Shown on the bracket instead of both names." error={fieldErrors.teamName}>
                    <Input value={details.teamName ?? ""} onChange={set("teamName")} />
                  </Field>
                </fieldset>
              )}

              {/* honeypot */}
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden
                className="hidden"
                value={details.website}
                onChange={set("website")}
              />

              <div className="flex justify-end">
                <Button type="submit" size="lg" disabled={!accepting}>
                  Continue to payment
                </Button>
              </div>
            </form>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <h2 className="display text-2xl">Scan &amp; pay</h2>
              <div className="grid items-center gap-6 sm:grid-cols-[14rem_1fr]">
                <div className="rounded-2xl bg-white p-3 shadow-[0_0_0_4px_var(--color-ball)]">
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
                  <p className="display text-5xl text-flame">{money(division.fee, tournament.currency)}</p>
                  <p className="text-ink">
                    {tournament.payment_instructions ||
                      "Scan the QR code with your e-wallet or banking app and pay the exact amount. Take a screenshot of the successful payment — you'll upload it next."}
                  </p>
                </div>
              </div>
              <Field label="Reference number (optional)" hint="From your payment receipt — helps us match your payment.">
                <Input value={details.paymentRef ?? ""} onChange={set("paymentRef")} />
              </Field>
              <div className="flex justify-between gap-3">
                <Button variant="ghost" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button size="lg" onClick={() => setStep(2)} disabled={!accepting}>
                  I&apos;ve paid
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <h2 className="display text-2xl">Upload payment proof</h2>
              <p className="text-ink">Your slot is confirmed as soon as your screenshot is uploaded.</p>
              <label
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition",
                  file ? "border-court/60 bg-court/5" : "border-white/20 hover:border-ball hover:bg-ball/5",
                )}
              >
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Selected payment screenshot" className="max-h-72 rounded-lg object-contain" />
                ) : (
                  <span className="display text-xl text-ink">Tap to choose screenshot</span>
                )}
                <span className="text-sm font-semibold text-chrome">{file ? file.name : "JPG, PNG or WebP"}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  className="sr-only"
                  onChange={(e) => {
                    setError(null);
                    setFile(e.target.files?.[0] ?? null);
                  }}
                />
              </label>

              {error && <Alert>{error}</Alert>}

              <div className="flex justify-between gap-3">
                <Button variant="ghost" onClick={() => setStep(1)} disabled={pending}>
                  Back
                </Button>
                <Button size="lg" onClick={submit} disabled={pending || !file || !accepting}>
                  {pending ? phase ?? "Submitting…" : "Submit & confirm slot"}
                </Button>
              </div>
            </div>
          )}
          {step !== 2 && error && (
            <div className="mt-5">
              <Alert>{error}</Alert>
            </div>
          )}
        </div>
      </div>

      <aside className="h-fit space-y-4 rounded-2xl border border-white/10 bg-navy-900/70 p-5 lg:sticky lg:top-20">
        <Badge tone={accent}>{doubles ? "Doubles" : "Singles"}</Badge>
        <p className="display text-3xl">{division.name}</p>
        <SlotMeter cap={division.slot_cap} taken={division.confirmed_count} accent={accent} />
        <dl className="space-y-1 border-t border-white/10 pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink">Entry fee</dt>
            <dd className="font-bold">{money(division.fee, tournament.currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink">Tournament</dt>
            <dd className="text-right font-bold">{tournament.name}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
