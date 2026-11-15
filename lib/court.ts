// Court-time helpers shared by the booking page and admin. Pure, so they run on server and client.
// They mirror the checks in hold_booking() so the UI only offers hours the database will accept.
import type { BusyInterval, CourtSettings } from "@/lib/types";

/** The court runs on Manila time, which has no daylight saving. */
export const COURT_TIME_ZONE = "Asia/Manila";
const OFFSET_MS = 8 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type Rules = Pick<CourtSettings, "open_hour" | "close_hour" | "max_hours" | "days_ahead">;

/** Court-local calendar date (YYYY-MM-DD) of an instant. */
export function courtDay(at: Date = new Date()): string {
  return new Date(at.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant a court-local hour starts on a court-local day (hour 24 = next midnight). */
export function courtInstant(day: string, hour: number): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) - OFFSET_MS + hour * HOUR_MS);
}

/** Days a customer can book: today through today + days_ahead, court-local. */
export function bookableDays(rules: Pick<Rules, "days_ahead">, now: Date = new Date()): string[] {
  const start = Date.parse(`${courtDay(now)}T00:00:00Z`);
  return Array.from({ length: rules.days_ahead + 1 }, (_, i) =>
    new Date(start + i * DAY_MS).toISOString().slice(0, 10),
  );
}

export interface HourSlot {
  /** Court-local start hour. */
  hour: number;
  /** ISO instant the hour starts. */
  startsAt: string;
  /** Not in the past and not overlapping a booking or live hold. */
  free: boolean;
}

/** One entry per opening hour of the day, open_hour up to (not including) close_hour. */
export function daySlots(day: string, rules: Rules, busy: BusyInterval[], now: Date = new Date()): HourSlot[] {
  const taken = busy.map((b) => [Date.parse(b.starts_at), Date.parse(b.ends_at)] as const);
  const slots: HourSlot[] = [];
  for (let hour = rules.open_hour; hour < rules.close_hour; hour++) {
    const start = courtInstant(day, hour).getTime();
    const end = start + HOUR_MS;
    const free = start > now.getTime() && !taken.some(([s, e]) => s < end && e > start);
    slots.push({ hour, startsAt: new Date(start).toISOString(), free });
  }
  return slots;
}

/** Longest booking (hours, capped at max_hours) that can start at `hour`; 0 if it can't start there. */
export function maxHoursFrom(slots: HourSlot[], hour: number, rules: Pick<Rules, "max_hours">): number {
  const i = slots.findIndex((s) => s.hour === hour);
  if (i < 0) return 0;
  let n = 0;
  while (n < rules.max_hours && slots[i + n]?.free) n++;
  return n;
}

/** "6 AM", "12 PM", "10 PM" for a court-local hour. */
export function hourLabel(hour: number): string {
  const h = hour % 24;
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
}
