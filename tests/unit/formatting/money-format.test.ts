import { describe, expect, it } from "vitest";

import { formatSomoni } from "@/core/formatting/money";

const NBSP = " ";

/**
 * These assertions are written with explicit separators on purpose. The point of the formatter is that
 * its output does not depend on which ICU the code happens to be running on — Chromium ships no Tajik
 * data and falls back to American separators — so a test that asked `Intl` what to expect would agree
 * with the bug.
 */
describe("formatSomoni", () => {
  it("writes somoni the same way in both languages, differing only in the word", () => {
    expect(formatSomoni(5_000, "ru-TJ")).toBe(`50,00${NBSP}сомони`);
    expect(formatSomoni(5_000, "tg-TJ")).toBe(`50,00${NBSP}сомонӣ`);
  });

  it("groups thousands with a non-breaking space, so the amount never wraps away from its unit", () => {
    expect(formatSomoni(123_456_750)).toBe(`1${NBSP}234${NBSP}567,50${NBSP}сомони`);
    expect(formatSomoni(100_000)).toBe(`1${NBSP}000,00${NBSP}сомони`);
  });

  it("keeps both minor digits, including the ones a person would drop", () => {
    expect(formatSomoni(1)).toBe(`0,01${NBSP}сомони`);
    expect(formatSomoni(0)).toBe(`0,00${NBSP}сомони`);
    expect(formatSomoni(1_005)).toBe(`10,05${NBSP}сомони`);
    expect(formatSomoni(1_050)).toBe(`10,50${NBSP}сомони`);
  });

  it("counts in whole diram rather than through a float", () => {
    // 1/100 has no exact binary form; going through the division loses the hundredth.
    expect(formatSomoni(8_640_000_01 % 100_000)).toContain(",");
    expect(formatSomoni(70_007)).toBe(`700,07${NBSP}сомони`);
  });

  it("keeps the sign in front, for the refund that has to read as one", () => {
    expect(formatSomoni(-5_000)).toBe(`-50,00${NBSP}сомони`);
  });
});
