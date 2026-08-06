import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { authenticateCredentials } from "@/core/auth/credential-identity";
import { completePasswordReset, requestPasswordReset } from "@/core/auth/password-reset";
import { hashPassword } from "@/core/auth/password";
import { prisma } from "@/core/database/prisma";
import type { PayomSmsMessage } from "@/integrations/payom/payom-client";

/**
 * Recovery over SMS, because most owners registered with a phone and no email. The two properties that
 * matter: the endpoint must not reveal which numbers have accounts, and one code must buy exactly one
 * password change.
 */
describe("password reset over SMS", () => {
  const sent: PayomSmsMessage[] = [];
  const gateway = {
    sendSms: async (input: PayomSmsMessage) => {
      sent.push(input);
      return { externalId: "payom-id", deliveryStatus: "SERVICE_ACCEPTED" };
    },
  };

  beforeEach(() => {
    sent.length = 0;
    process.env.PAYOM_API_TOKEN = "test-token";
    process.env.PAYOM_PHONE_VERIFICATION_TEMPLATE_ID = "template-code-id";
    process.env.AUTH_SECRET ??= "test-auth-secret-at-least-32-characters";
  });

  afterEach(() => {
    delete process.env.PAYOM_API_TOKEN;
    delete process.env.PAYOM_PHONE_VERIFICATION_TEMPLATE_ID;
  });

  it("answers the same way for a number that has no account", async () => {
    const result = await requestPasswordReset({ phone: uniquePhone() }, new Date(), gateway);

    expect(result).toEqual({ verificationId: null });
    // No account means no SMS either, so nobody is texted about an account they do not have.
    expect(sent).toHaveLength(0);
  });

  it("lets an owner set a new password with the code and log in with it", async () => {
    const { phone } = await createOwner("old-password-1");
    const requested = await requestPasswordReset({ phone }, new Date(), gateway);
    expect(requested.verificationId).not.toBeNull();
    const code = sent[0]?.variables["text-2"] ?? "";

    await completePasswordReset({ verificationId: requested.verificationId ?? "", phone, code, password: "new-password-1" });

    await expect(authenticateCredentials(phone, "new-password-1")).resolves.toMatchObject({ name: "Owner" });
    await expect(authenticateCredentials(phone, "old-password-1")).resolves.toBeNull();
  });

  it("refuses to reuse the same code for a second reset", async () => {
    const { phone } = await createOwner("old-password-1");
    const requested = await requestPasswordReset({ phone }, new Date(), gateway);
    const code = sent[0]?.variables["text-2"] ?? "";
    await completePasswordReset({ verificationId: requested.verificationId ?? "", phone, code, password: "new-password-1" });

    await expect(
      completePasswordReset({ verificationId: requested.verificationId ?? "", phone, code, password: "another-password-1" }),
    ).rejects.toMatchObject({ name: "PhoneVerificationError" });
    await expect(authenticateCredentials(phone, "another-password-1")).resolves.toBeNull();
  });

  it("refuses a wrong code and leaves the old password working", async () => {
    const { phone } = await createOwner("old-password-1");
    const requested = await requestPasswordReset({ phone }, new Date(), gateway);
    const actual = sent[0]?.variables["text-2"] ?? "";
    const wrong = actual === "000000" ? "111111" : "000000";

    await expect(
      completePasswordReset({ verificationId: requested.verificationId ?? "", phone, code: wrong, password: "new-password-1" }),
    ).rejects.toMatchObject({ code: "INVALID_CODE" });
    await expect(authenticateCredentials(phone, "old-password-1")).resolves.toMatchObject({ name: "Owner" });
  });

  it("refuses a password shorter than the minimum before touching the code", async () => {
    const { phone } = await createOwner("old-password-1");
    const requested = await requestPasswordReset({ phone }, new Date(), gateway);
    const code = sent[0]?.variables["text-2"] ?? "";

    await expect(
      completePasswordReset({ verificationId: requested.verificationId ?? "", phone, code, password: "short" }),
    ).rejects.toMatchObject({ code: "WEAK_PASSWORD" });
    // The code survives, so a rejected password does not cost the owner another SMS.
    await expect(
      completePasswordReset({ verificationId: requested.verificationId ?? "", phone, code, password: "long-enough-1" }),
    ).resolves.toMatchObject({ userId: expect.any(String) });
  });

  it("records the recovery in the business audit log", async () => {
    const { phone, businessId } = await createOwner("old-password-1");
    const requested = await requestPasswordReset({ phone }, new Date(), gateway);
    const code = sent[0]?.variables["text-2"] ?? "";
    await completePasswordReset({ verificationId: requested.verificationId ?? "", phone, code, password: "new-password-1" });

    const events = await prisma.auditEvent.findMany({ where: { businessId, type: "auth.password_reset" } });
    expect(events).toHaveLength(1);
    // Only a masked number reaches the log; the audit trail is not a place for personal data in full.
    expect(JSON.stringify(events[0]?.metadata)).not.toContain(phone);
  });
});

async function createOwner(password: string) {
  const phone = uniquePhone();
  const user = await prisma.user.create({
    data: { phone, displayName: "Owner", passwordHash: await hashPassword(password) },
  });
  const business = await prisma.business.create({ data: { name: "Reset Salon", slug: `reset-salon-${crypto.randomUUID()}` } });
  await prisma.membership.create({ data: { userId: user.id, businessId: business.id, role: "OWNER" } });
  return { phone, userId: user.id, businessId: business.id };
}

function uniquePhone(): string {
  const suffix = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
  return `+992901${suffix}`;
}
