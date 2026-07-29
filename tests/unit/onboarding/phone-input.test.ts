import { describe, expect, it } from "vitest";

import { formatTajikPhoneInput, normalizeTajikPhone } from "@/features/onboarding/tajik-phone";

describe("Tajik phone input", () => {
  it("keeps +992 fixed and formats nine local digits", () => {
    expect(formatTajikPhoneInput("+992901234567")).toBe("+992 90 123 45 67");
    expect(formatTajikPhoneInput("90123")).toBe("+992 90 123");
    expect(normalizeTajikPhone("+992 90 123 45 67")).toBe("+992901234567");
  });
});
