import { afterEach, describe, expect, it } from "vitest";

import { buildPhoneVerificationSms } from "@/integrations/payom/payom-templates";

/**
 * The approved template is "Ваш код подтверждения {code-1}", and payom substitutes nothing it was not
 * given: a placeholder we forget ships to the customer as the literal "{code-1}". Since a template cannot
 * be edited after moderation and this one gates both booking verification and account recovery, the one
 * variable it has is worth pinning.
 */
describe("phone verification SMS", () => {
  const previous = process.env.PAYOM_PHONE_VERIFICATION_TEMPLATE_ID;

  afterEach(() => {
    if (previous === undefined) delete process.env.PAYOM_PHONE_VERIFICATION_TEMPLATE_ID;
    else process.env.PAYOM_PHONE_VERIFICATION_TEMPLATE_ID = previous;
  });

  it("puts the code in payom's own code placeholder, not in free text", () => {
    process.env.PAYOM_PHONE_VERIFICATION_TEMPLATE_ID = "template-otp";

    expect(buildPhoneVerificationSms("123456")).toEqual({
      templateId: "template-otp",
      variables: { "code-1": "123456" },
    });
  });

  it("refuses to build anything while the template is unmoderated", () => {
    delete process.env.PAYOM_PHONE_VERIFICATION_TEMPLATE_ID;

    expect(() => buildPhoneVerificationSms("123456")).toThrow(/PAYOM_PHONE_VERIFICATION_TEMPLATE_ID/);
  });

});
