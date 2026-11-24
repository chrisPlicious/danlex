"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { PayeeDetails } from "@/components/payee-details";
import { Alert, Badge, Button, cn, Field, Input } from "@/components/ui";
import { compressImage } from "@/lib/compress-image";
import { money } from "@/lib/format";
import { countdown } from "@/lib/open-play";
import type { Payee } from "@/lib/payee";
import { isPaymentRef, PAYMENT_REF_ERROR, pastedPaymentRef, typedPaymentRef } from "@/lib/payment-ref";
import { browserClient } from "@/lib/supabase/browser";
import { completeSignup, startSignupProofUpload } from "./actions";

export interface PayTicket {
  signupId: string;
  holdToken: string;
  amount: number;
  /** Local-clock instant the hold or offer runs out. */
  expiresAt: number;
}

/** Scan the QR, enter the reference, upload the receipt. Used for new holds and waitlist offers. */
export function PayPanel({
  ticket,
  currency,
  qrUrl,
  instructions,
  payee,
  offer,
  onStartOver,
}: {
  ticket: PayTicket;
  currency: string;
  qrUrl: string;
  instructions: string | null;
  payee: Payee;
  /** A waitlist offer rather than a fresh hold: changes the copy only. */
  offer?: boolean;
  onStartOver?: () => void;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [paymentRef, setPaymentRef] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const msLeft = ticket.expiresAt - now;

  function choose(next: File | null) {
    setError(null);
    setFile(next);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return next ? URL.createObjectURL(next) : null;
    });
  }

  function submit() {
    if (!isPaymentRef(paymentRef)) return setFieldError(PAYMENT_REF_ERROR);
    setFieldError(null);
    if (!file) return setError("Please choose your payment screenshot.");
    setError(null);
    startTransition(async () => {
      try {
        setPhase("Preparing image…");
        const blob = await compressImage(file);

        setPhase("Reserving upload…");
        const upload = await startSignupProofUpload(ticket.signupId, ticket.holdToken);
        if (!upload.ok) return setError(upload.error);

        setPhase("Uploading receipt…");
        const { error: upErr } = await browserClient()
          .storage.from("payment-proofs")
          .uploadToSignedUrl(upload.path, upload.token, blob, { contentType: "image/jpeg" });
        if (upErr) return setError("Upload failed. Check your connection and try again.");

        setPhase("Confirming your spot…");
        const result = await completeSignup({
          signupId: ticket.signupId,
          holdToken: ticket.holdToken,
          paymentRef,
          proofPath: upload.path,
        });
        if (!result.ok) {
          if ("fields" in result && result.fields?.paymentRef) setFieldError(result.fields.paymentRef);
          return setError(result.error);
        }
        router.push(`/play/s/${result.code}`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      } finally {
        setPhase(null);
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="display text-2xl">Scan &amp; pay</h2>
        {msLeft > 0 ? (
          <Badge tone="court">
            {offer ? "Offer ends in" : "Held for"} {countdown(msLeft)}
          </Badge>
        ) : (
          <Badge tone="ball">{offer ? "Offer ran out" : "Hold ran out"}</Badge>
        )}
      </div>
      {msLeft <= 0 && (
        <Alert tone="ball">
          Your {offer ? "offer" : "15-minute hold"} ran out. You can still upload your receipt — if a spot is still free,
          it&apos;s yours. If not, we&apos;ll keep your receipt and refund you.
        </Alert>
      )}
      <div className="grid items-center gap-6 sm:grid-cols-[14rem_1fr]">
        <div className="rounded-md bg-white p-3 shadow-[0_0_0_4px_var(--color-ball)]">
          <Image src={qrUrl} alt="Payment QR code" width={400} height={400} unoptimized className="aspect-square w-full object-contain" />
        </div>
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-wider text-ink">Amount due</p>
          <p className="score text-5xl text-accent">{money(ticket.amount, currency)}</p>
          <p className="text-ink">
            {instructions ||
              "Scan the QR code with your e-wallet or banking app and pay the exact amount. Take a screenshot of the successful payment and upload it below."}
          </p>
          <PayeeDetails payee={payee} />
        </div>
      </div>
      <Field
        label="Last 6 digits of your reference number"
        hint="It's on your payment receipt. Numbers only."
        error={fieldError ?? undefined}
      >
        <Input
          inputMode="numeric"
          autoComplete="off"
          required
          placeholder="123456"
          className="sm:max-w-60"
          value={paymentRef}
          onChange={(e) => setPaymentRef(typedPaymentRef(e.target.value))}
          onPaste={(e) => {
            e.preventDefault();
            setPaymentRef(pastedPaymentRef(e.clipboardData.getData("text")));
          }}
        />
      </Field>
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

      <div className="flex flex-wrap justify-between gap-3">
        {onStartOver ? (
          <Button variant="ghost" onClick={onStartOver} disabled={pending}>
            Start over
          </Button>
        ) : (
          <span />
        )}
        <Button size="lg" onClick={submit} disabled={pending || !file}>
          {pending ? (phase ?? "Submitting…") : "Submit & confirm my spot"}
        </Button>
      </div>
    </div>
  );
}
