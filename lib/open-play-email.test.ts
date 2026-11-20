import { describe, expect, it } from "vitest";
import { openPlayEmail } from "./open-play-email";

const base = {
  name: "Ana <script>",
  code: "DLS-1A2B3C4D",
  session: "Friday Open Play",
  when: "Fri, Nov 20 · 6:00 PM – 8:00 PM",
  amount: "₱150.00",
  url: "https://example.test/play/s/DLS-1A2B3C4D?t=abc",
};

describe("open play emails", () => {
  it("confirms a spot with the code and a link", () => {
    const e = openPlayEmail({ ...base, kind: "confirmed" });
    expect(e.subject).toBe("You're in: Friday Open Play, Fri, Nov 20 · 6:00 PM – 8:00 PM");
    expect(e.text).toContain("Your code: DLS-1A2B3C4D");
    expect(e.text).toContain("Paid: ₱150.00");
    expect(e.html).toContain('href="https://example.test/play/s/DLS-1A2B3C4D?t=abc"');
  });

  it("escapes names in html", () => {
    const e = openPlayEmail({ ...base, kind: "waitlisted" });
    expect(e.html).toContain("Ana &lt;script&gt;");
    expect(e.html).not.toContain("<script>");
  });

  it("says when an offer runs out", () => {
    const e = openPlayEmail({ ...base, kind: "offered", payBy: "5:30 PM" });
    expect(e.text).toContain("until 5:30 PM");
    expect(e.text).toContain("Pay and claim my spot: https://example.test");
  });

  it("mentions refunds only when they paid", () => {
    expect(openPlayEmail({ ...base, kind: "cancelled", refund: true }).text).toContain("You'll be refunded");
    expect(openPlayEmail({ ...base, kind: "cancelled", refund: false }).text).toContain("nothing to refund");
    expect(openPlayEmail({ ...base, kind: "cancelled" }).html).not.toContain("<a href");
  });
});
