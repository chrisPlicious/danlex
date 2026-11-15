export function money(amount: number | string, currency: string): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function eventDate(date: string | null): string | null {
  if (!date) return null;
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** "Sat, Nov 21" for a YYYY-MM-DD calendar day. */
export function dayLabel(day: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

/** "Sat, Nov 21 · 6:00 PM – 8:00 PM" in court time. */
export function bookingWhen(startsAt: string, endsAt: string): string {
  const day = new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(startsAt));
  const time = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
  return `${day} · ${time.format(new Date(startsAt))} – ${time.format(new Date(endsAt))}`;
}

export function dateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(new Date(iso));
}
