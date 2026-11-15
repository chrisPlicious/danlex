import { describe, expect, it } from "vitest";
import { bookableDays, courtDay, courtInstant, daySlots, hourLabel, maxHoursFrom } from "./court";

const rules = { open_hour: 6, close_hour: 10, max_hours: 3, days_ahead: 2 };

describe("court time", () => {
  it("uses the Manila calendar day", () => {
    expect(courtDay(new Date("2026-11-15T15:59:00Z"))).toBe("2026-11-15");
    expect(courtDay(new Date("2026-11-15T16:00:00Z"))).toBe("2026-11-16");
  });

  it("maps a local hour to the right instant", () => {
    expect(courtInstant("2026-11-20", 10).toISOString()).toBe("2026-11-20T02:00:00.000Z");
    expect(courtInstant("2026-11-20", 0).toISOString()).toBe("2026-11-19T16:00:00.000Z");
    expect(courtInstant("2026-11-20", 24).toISOString()).toBe("2026-11-20T16:00:00.000Z");
  });

  it("lists today through days_ahead", () => {
    // 04:00 on Nov 16 in Manila
    expect(bookableDays(rules, new Date("2026-11-15T20:00:00Z"))).toEqual(["2026-11-16", "2026-11-17", "2026-11-18"]);
    expect(bookableDays({ days_ahead: 0 }, new Date("2026-11-15T20:00:00Z"))).toEqual(["2026-11-16"]);
  });

  it("labels hours", () => {
    expect([0, 6, 12, 13, 21, 24].map(hourLabel)).toEqual(["12 AM", "6 AM", "12 PM", "1 PM", "9 PM", "12 AM"]);
  });
});

describe("day slots", () => {
  const day = "2026-11-20";
  const before = new Date("2026-11-19T00:00:00Z");
  // 7–9 AM local is booked
  const busy = [{ starts_at: "2026-11-19T23:00:00Z", ends_at: "2026-11-20T01:00:00Z" }];

  it("covers opening hours and marks taken ones", () => {
    const slots = daySlots(day, rules, busy, before);
    expect(slots.map((s) => s.hour)).toEqual([6, 7, 8, 9]);
    expect(slots.map((s) => s.free)).toEqual([true, false, false, true]);
    expect(slots[0].startsAt).toBe("2026-11-19T22:00:00.000Z");
  });

  it("treats back-to-back bookings as free", () => {
    const edge = [{ starts_at: "2026-11-19T22:00:00Z", ends_at: "2026-11-19T23:00:00Z" }]; // 6–7 AM
    expect(daySlots(day, rules, edge, before).map((s) => s.free)).toEqual([false, true, true, true]);
  });

  it("closes hours that already started", () => {
    const at730 = new Date("2026-11-19T23:30:00Z");
    expect(daySlots(day, rules, [], at730).map((s) => s.free)).toEqual([false, false, true, true]);
  });

  it("caps a booking at the next taken hour, closing time and max_hours", () => {
    const slots = daySlots(day, rules, busy, before);
    expect(maxHoursFrom(slots, 6, rules)).toBe(1);
    expect(maxHoursFrom(slots, 7, rules)).toBe(0);
    expect(maxHoursFrom(slots, 9, rules)).toBe(1);
    expect(maxHoursFrom(daySlots(day, rules, [], before), 6, rules)).toBe(3);
    expect(maxHoursFrom(daySlots(day, rules, [], before), 6, { max_hours: 1 })).toBe(1);
    expect(maxHoursFrom(slots, 5, rules)).toBe(0);
  });
});
