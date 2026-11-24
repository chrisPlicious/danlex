// Who receives QR payments, shown beside the QR so players can type the GCash number instead of scanning.

export interface Payee {
  name: string | null;
  /** 11 digits, 09XXXXXXXXX. */
  number: string | null;
}

/** Shown until the admin enters the real receiver. Deliberately fake (all zeros). */
export const PAYEE_PLACEHOLDER = { name: "GCash account name", number: "09000000000" } as const;

export const MOBILE_11 = /^09\d{9}$/;

/** "0917 123 4567" */
export function formatMobile(n: string): string {
  return MOBILE_11.test(n) ? `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}` : n;
}

/** Admin input: spaces and dashes allowed, +63 folded to 0. Returns "" for a blank box. */
export function cleanMobile(input: string): string {
  const d = input.replace(/\D/g, "");
  return /^63\d{10}$/.test(d) ? `0${d.slice(2)}` : d;
}
