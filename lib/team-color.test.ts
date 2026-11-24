import { describe, expect, it } from "vitest";
import { colorName, HEX_COLOR, TEAM_COLORS, textOn } from "./team-color";

describe("team colours", () => {
  it("stores every palette colour in the format the database accepts", () => {
    for (const c of TEAM_COLORS) expect(c.hex).toMatch(HEX_COLOR);
  });

  it("picks readable text for light and dark backgrounds", () => {
    expect(textOn("#ffffff")).toBe("#111111");
    expect(textOn("#facc15")).toBe("#111111");
    expect(textOn("#171717")).toBe("#ffffff");
    expect(textOn("#1d4ed8")).toBe("#ffffff");
    expect(textOn("#7e22ce")).toBe("#ffffff");
  });

  it("names palette colours and falls back to the hex", () => {
    expect(colorName("#7e22ce")).toBe("Purple");
    expect(colorName("#123456")).toBe("#123456");
  });
});
