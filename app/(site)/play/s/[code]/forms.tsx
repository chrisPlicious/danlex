"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import type { Payee } from "@/lib/payee";
import { cancelSignup, findOffer } from "../../actions";
import { PayPanel } from "../../pay-panel";

/** The offer email lost? The mobile number used to sign up unlocks the payment link. */
export function OfferLookup({ code }: { code: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await findOffer(code, phone);
          if (!res.ok) return setError(res.error);
          router.replace(`/play/s/${code}?t=${res.token}`);
        });
      }}
    >
      <Field label="Mobile number you signed up with" hint="Or open the link in the email we sent you.">
        <Input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" disabled={pending || phone.trim().length < 7}>
        {pending ? "Checking…" : "Pay for my spot"}
      </Button>
    </form>
  );
}

export function CancelForm({ code, paid }: { code: string; paid: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-ink underline hover:text-fg">
        Can&apos;t make it? Give up my spot
      </button>
    );
  }
  return (
    <form
      className="mx-auto max-w-sm space-y-3 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await cancelSignup(code, phone);
          if (!res.ok) return setError(res.error);
          router.refresh();
        });
      }}
    >
      <p className="text-sm text-ink">
        {paid
          ? "Your spot goes to the next player on the waitlist and the organisers will refund you."
          : "Your place goes to the next player."}
      </p>
      <Field label="Mobile number you signed up with">
        <Input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={pending || phone.trim().length < 7}>
          {pending ? "Cancelling…" : "Cancel my spot"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Keep it
        </Button>
      </div>
    </form>
  );
}

/** PayPanel for a server-rendered page: the hold's end comes in as time left on the server clock. */
export function OfferPay({
  signupId,
  holdToken,
  amount,
  msLeft,
  currency,
  qrUrl,
  instructions,
  payee,
  offer,
}: {
  signupId: string;
  holdToken: string;
  amount: number;
  msLeft: number;
  currency: string;
  qrUrl: string;
  instructions: string | null;
  payee: Payee;
  offer: boolean;
}) {
  const [expiresAt] = useState(() => Date.now() + msLeft);
  return (
    <PayPanel
      ticket={{ signupId, holdToken, amount, expiresAt }}
      currency={currency}
      qrUrl={qrUrl}
      instructions={instructions}
      payee={payee}
      offer={offer}
    />
  );
}
