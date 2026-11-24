"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { formatMobile, PAYEE_PLACEHOLDER, type Payee } from "@/lib/payee";

/** The other way to pay: the GCash number and name of whoever the QR pays, with a copy button. */
export function PayeeDetails({ payee }: { payee: Payee }) {
  const number = payee.number ?? PAYEE_PLACEHOLDER.number;
  const name = payee.name ?? PAYEE_PLACEHOLDER.name;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked: the number is on screen to type by hand
    }
  }

  return (
    <div className="rounded-md border border-fg/15 bg-well p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-ink">Can&apos;t scan? Send to this GCash number</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="score text-2xl tracking-wide">{formatMobile(number)}</p>
          <p className="truncate text-sm font-semibold">{name}</p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={copy}>
          {copied ? "Copied" : "Copy number"}
        </Button>
      </div>
    </div>
  );
}
