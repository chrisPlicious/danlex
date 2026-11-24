/** Team colours (usually shirt colours). Stored on registrations as lowercase #rrggbb. */
export const TEAM_COLORS = [
  { name: "Red", hex: "#b91c1c" },
  { name: "Orange", hex: "#ea580c" },
  { name: "Yellow", hex: "#facc15" },
  { name: "Green", hex: "#15803d" },
  { name: "Blue", hex: "#1d4ed8" },
  { name: "Purple", hex: "#7e22ce" },
  { name: "Pink", hex: "#db2777" },
  { name: "Brown", hex: "#7c4a1e" },
  { name: "Black", hex: "#171717" },
  { name: "White", hex: "#ffffff" },
] as const;

export const HEX_COLOR = /^#[0-9a-f]{6}$/;

export function colorName(hex: string): string {
  return TEAM_COLORS.find((c) => c.hex === hex)?.name ?? hex;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const DARK = "#111111";
const LIGHT = "#ffffff";

/** Whichever of near-black or white text reads better on the given background. */
export function textOn(hex: string): string {
  const l = luminance(hex);
  const onDark = (1 + 0.05) / (l + 0.05);
  const onLight = (l + 0.05) / (luminance(DARK) + 0.05);
  return onDark >= onLight ? LIGHT : DARK;
}
