import { afterEach, describe, expect, it } from "vitest";

import { buildPhoneVerificationSms, PLATFORM_SMS_LABEL, smsLabel } from "@/integrations/payom/payom-templates";

/**
 * The approved template is "{text-1} - код подтверждения: {code-1}", and payom substitutes nothing it was
 * not given: a placeholder we forget ships to the customer as literal "{code-1}", and one we invent is
 * dropped silently. Since a template cannot be edited after moderation, the mapping is worth pinning.
 */
describe("phone verification SMS", () => {
  const previous = process.env.PAYOM_PHONE_VERIFICATION_TEMPLATE_ID;

  afterEach(() => {
    if (previous === undefined) delete process.env.PAYOM_PHONE_VERIFICATION_TEMPLATE_ID;
    else process.env.PAYOM_PHONE_VERIFICATION_TEMPLATE_ID = previous;
  });

  it("puts the name in free text and the code in payom's code placeholder", () => {
    process.env.PAYOM_PHONE_VERIFICATION_TEMPLATE_ID = "template-otp";

    expect(buildPhoneVerificationSms("123456", "Барбершоп Алиф")).toEqual({
      templateId: "template-otp",
      variables: { "text-1": "Барбершоп Алиф", "code-1": "123456" },
    });
  });

  it("refuses to build anything while the template is unmoderated", () => {
    delete process.env.PAYOM_PHONE_VERIFICATION_TEMPLATE_ID;

    expect(() => buildPhoneVerificationSms("123456", "Барбершоп Алиф")).toThrow(/PAYOM_PHONE_VERIFICATION_TEMPLATE_ID/);
  });

  it("falls back to the platform when nobody in particular is asking", () => {
    // Account recovery has no salon to name, and an empty name would ship " - код подтверждения: 123456".
    expect(smsLabel(null)).toBe(PLATFORM_SMS_LABEL);
    expect(smsLabel("   ")).toBe(PLATFORM_SMS_LABEL);
  });

  it("truncates a name that would push the code into a second SMS segment", () => {
    const long = "Салон красоты «Восточная сказка» на Рудаки";

    const label = smsLabel(long);

    // Cyrillic fits 70 characters per segment and the fixed wording spends 28 of them.
    expect(label.length).toBeLessThanOrEqual(40);
    expect(label.endsWith("…")).toBe(true);
    expect(smsLabel("Барбершоп Алиф")).toBe("Барбершоп Алиф");
  });
});
