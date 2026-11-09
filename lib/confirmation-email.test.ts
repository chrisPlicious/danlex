import { describe, expect, it } from "vitest";
import { confirmationEmail } from "./confirmation-email";

const entry = {
  code: "DLX-1A2B3C4D",
  playerName: "Miguel Santos",
  divisionName: "Singles",
  tournamentName: "Danlex Open",
  eventDate: "Sat, November 21, 2026",
  venue: "Danlex Pickle Court",
};

describe("confirmationEmail", () => {
  it("names the tournament and division in the subject", () => {
    expect(confirmationEmail(entry).subject).toBe("You're in: Danlex Open, Singles");
  });

  it("puts everything the player needs in both versions", () => {
    const { text, html } = confirmationEmail(entry);
    for (const part of [text, html]) {
      expect(part).toContain("Miguel Santos");
      expect(part).toContain("DLX-1A2B3C4D");
      expect(part).toContain("Danlex Open");
      expect(part).toContain("Singles");
      expect(part).toContain("Sat, November 21, 2026");
      expect(part).toContain("Danlex Pickle Court");
      expect(part).toContain("check-in");
    }
  });

  it("leaves out date and venue when the tournament has none", () => {
    const { text, html } = confirmationEmail({ ...entry, eventDate: null, venue: null });
    expect(text).not.toMatch(/Date:|Venue:/);
    expect(html).not.toMatch(/Date|Venue/);
  });

  it("escapes player-typed names in the HTML version", () => {
    const { html, text } = confirmationEmail({ ...entry, playerName: `<img src=x onerror="a()"> & Co's` });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;a()&quot;&gt; &amp; Co&#39;s");
    expect(text).toContain(`<img src=x onerror="a()"> & Co's`);
  });
});
