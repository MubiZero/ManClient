/**
 * A salon picks one colour; the interface needs eleven.
 *
 * The brand colour used to be pasted straight into `--color-primary` while the text on top stayed
 * white, the hover stayed the default green and the selected card stayed pale green. A yellow salon
 * therefore got a white-on-yellow button that cannot be read in daylight — and never found out,
 * because the owner sees their own colour and assumes it is meant to look like that.
 *
 * Here the chosen colour keeps its hue and gives up its lightness: every step is placed on the same
 * ladder the default palette uses, so the pale steps stay pale enough for dark text and the deep
 * steps stay deep enough for white. Everything else in the theme is expressed in these steps —
 * primary, ring, accent, hover, the dark theme — so overriding them is enough, and no component
 * needs to know a business chose a colour at all.
 */

/** Lightness of each step, measured off the default palette so a custom brand sits where it does. */
const LIGHTNESS_LADDER: Record<string, number> = {
  "50": 0.96,
  "100": 0.885,
  "200": 0.775,
  "300": 0.635,
  "400": 0.475,
  "500": 0.315,
  "600": 0.26,
  "700": 0.21,
  "800": 0.17,
  "900": 0.14,
  "950": 0.08,
};

/**
 * Saturation is trimmed at the pale end. A fully saturated near-white reads as a stain rather than a
 * tint, and the same value that looks right at step 600 looks radioactive at step 50.
 */
const SATURATION_SCALE: Record<string, number> = {
  "50": 0.35,
  "100": 0.5,
  "200": 0.65,
  "300": 0.8,
  "400": 0.95,
  "500": 1,
  "600": 1,
  "700": 1,
  "800": 0.95,
  "900": 0.9,
  "950": 0.85,
};

export type BrandPalette = Record<string, string>;

/**
 * CSS variables for a business's colour, or null when the value is not a colour at all — in which
 * case the page keeps the default palette instead of being painted with nonsense.
 */
export function brandPalette(brandColor: string): BrandPalette | null {
  const rgb = parseHex(brandColor);
  if (!rgb) return null;

  const { hue, saturation } = toHsl(rgb);
  const palette: BrandPalette = {};
  for (const [step, lightness] of Object.entries(LIGHTNESS_LADDER)) {
    palette[`--color-brand-${step}`] = toHex(fromHsl(hue, Math.min(1, saturation * SATURATION_SCALE[step]), lightness));
  }

  // Chosen against the step the theme actually paints buttons with, rather than assumed to be white:
  // a very light hue at step 600 is rare but possible, and white on it would be unreadable.
  const primary = palette["--color-brand-600"];
  palette["--color-primary"] = primary;
  palette["--color-ring"] = primary;
  palette["--color-primary-foreground"] = contrastRatio(primary, "#ffffff") >= contrastRatio(primary, "#0a0a0a")
    ? "#ffffff"
    : "#0a0a0a";
  return palette;
}

/** WCAG contrast between two hex colours, 1 (identical) to 21 (black on white). */
export function contrastRatio(left: string, right: string): number {
  const first = relativeLuminance(left);
  const second = relativeLuminance(right);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [red, green, blue] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function parseHex(value: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const digits = match[1];
  return [0, 2, 4].map((offset) => parseInt(digits.slice(offset, offset + 2), 16)) as [number, number, number];
}

function toHsl([red, green, blue]: [number, number, number]): { hue: number; saturation: number; lightness: number } {
  const [r, g, b] = [red / 255, green / 255, blue / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return { hue: 0, saturation: 0, lightness };

  const delta = max - min;
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  const hue = max === r
    ? (((g - b) / delta) % 6 + 6) % 6
    : max === g
      ? (b - r) / delta + 2
      : (r - g) / delta + 4;
  return { hue: hue * 60, saturation, lightness };
}

function fromHsl(hue: number, saturation: number, lightness: number): [number, number, number] {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = ((hue % 360) + 360) % 360 / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const [r, g, b] = sector < 1 ? [chroma, second, 0]
    : sector < 2 ? [second, chroma, 0]
    : sector < 3 ? [0, chroma, second]
    : sector < 4 ? [0, second, chroma]
    : sector < 5 ? [second, 0, chroma]
    : [chroma, 0, second];
  const offset = lightness - chroma / 2;
  return [r, g, b].map((channel) => Math.round((channel + offset) * 255)) as [number, number, number];
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0")).join("")}`;
}
