import { describe, expect, it } from "vitest";
import { bookingEmail } from "./booking-email";

const booking = {
  code: "DLB-1A2B3C4D",
  name: "Ana Reyes",
  playType: "Open Play",
  when: "Sat, Nov 21 · 6:00 PM – 8:00 PM",
  amount: "₱700.00",
};

describe("bookingEmail", () => {
  it("names the play type and time in the subject", () => {
    expect(bookingEmail(booking).subject).toBe("You're booked: Open Play, Sat, Nov 21 · 6:00 PM – 8:00 PM");
  });

  it("puts everything the player needs in both versions", () => {
    const { text, html } = bookingEmail(booking);
    for (const part of [text, html]) {
      for (const value of ["Ana Reyes", "DLB-1A2B3C4D", "Open Play", "6:00 PM", "₱700.00"]) expect(part).toContain(value);
    }
  });

  it("escapes names in the HTML version", () => {
    const { html, text } = bookingEmail({ ...booking, name: "<b>Ana</b> & co" });
    expect(html).toContain("&lt;b&gt;Ana&lt;/b&gt; &amp; co");
    expect(html).not.toContain("<b>Ana</b>");
    expect(text).toContain("<b>Ana</b> & co");
  });
});
