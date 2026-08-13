import { describe, expect, it } from "vitest";

import { brandPalette, contrastRatio } from "@/core/branding/brand-palette";

/**
 * A salon picks one colour and the whole interface has to stay readable — under salon lighting and in
 * direct sun. Before this the colour was pasted straight into `--color-primary` while the text on top
 * of it stayed white and the hover stayed the default green: a yellow brand produced a white-on-yellow
 * button nobody could read, and the salon never found out.
 */
describe("brandPalette", () => {
  const brands = ["#ffd400", "#f9f9f9", "#000000", "#217f57", "#1d4ed8", "#e11d48"];

  it("keeps button text readable on the primary step whatever colour was chosen", () => {
    for (const brand of brands) {
      const palette = brandPalette(brand)!;
      // 4.5:1 is the ordinary-text threshold; a button under salon lighting deserves no less.
      expect(contrastRatio(palette["--color-primary"], palette["--color-primary-foreground"])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the pale step pale and the deep step deep, so light and dark themes both hold", () => {
    for (const brand of brands) {
      const palette = brandPalette(brand)!;
      // The pale step carries dark text (selected cards, accents); the deep step carries white.
      expect(contrastRatio(palette["--color-brand-50"], "#0b3c25")).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette["--color-brand-700"], "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("stays recognisably the colour the salon chose", () => {
    const palette = brandPalette("#1d4ed8")!;
    // Hue is preserved even though lightness is not: a blue brand stays blue.
    expect(palette["--color-brand-600"]).toMatch(/^#/);
    expect(hue(palette["--color-brand-600"])).toBeCloseTo(hue("#1d4ed8"), -1);
  });

  it("refuses anything that is not a colour rather than painting the page with it", () => {
    expect(brandPalette("not-a-colour")).toBeNull();
    expect(brandPalette("#12345")).toBeNull();
  });
});

function hue(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  if (max === min) return 0;
  const delta = max - min;
  const value = max === red ? (green - blue) / delta % 6 : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
  return (value * 60 + 360) % 360;
}
