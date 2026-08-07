import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/core/database/prisma";
import {
  confirmPhoneVerification,
  consumeVerifiedPhone,
  isPhoneVerificationConfigured,
  isPhoneVerificationRequired,
  PhoneVerificationError,
  requestPhoneVerification,
} from "@/core/security/phone-verification-service";
import { assertPhoneVerified, spendPhoneVerification } from "@/core/security/phone-verification-gate";
import { runSecurityMaintenance } from "@/core/security/security-maintenance";
import type { PayomSmsMessage } from "@/integrations/payom/payom-client";

/**
 * The whole point of these codes is that a stranger cannot book under somebody else's number, so the
 * cases worth pinning are the ones that would quietly give that away again: a code that survives being
 * used, a code accepted for a different number, or guessing without a cap.
 */
describe("phone verification", () => {
  const businessIds: string[] = [];
  const sent: PayomSmsMessage[] = [];
  const sendSms = async (input: PayomSmsMessage) => {
    sent.push(input);
    return { externalId: "payom-id", deliveryStatus: "SERVICE_ACCEPTED" };
  };

  beforeEach(() => {
    sent.length = 0;
    process.env.PAYOM_API_TOKEN = "test-token";
    process.env.PAYOM_PHONE_VERIFICATION_TEMPLATE_ID = "template-code-id";
    process.env.AUTH_SECRET ??= "test-auth-secret-at-least-32-characters";
    delete process.env.PHONE_VERIFICATION_REQUIRED;
  });

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    delete process.env.PAYOM_API_TOKEN;
    delete process.env.PAYOM_PHONE_VERIFICATION_TEMPLATE_ID;
    delete process.env.PHONE_VERIFICATION_REQUIRED;
  });

  it("stays off entirely while no moderated template is configured", async () => {
    delete process.env.PAYOM_PHONE_VERIFICATION_TEMPLATE_ID;
    expect(isPhoneVerificationConfigured()).toBe(false);
    expect(isPhoneVerificationRequired()).toBe(false);

    // With the feature off, an unverified booking must pass exactly as it did before.
    await expect(assertPhoneVerified({ phone: "+992900001111" })).resolves.toBeUndefined();
    await expect(requestPhoneVerification({ phone: "+992900001111", purpose: "BOOKING" }, new Date(), { sendSms })).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
  });

  it("names the salon the customer is booking with, read from the database", async () => {
    const business = await prisma.business.create({ data: { name: "Барбершоп Алиф", slug: `alif-${randomUUID()}` } });
    businessIds.push(business.id);

    await requestPhoneVerification({ phone: uniquePhone(), purpose: "BOOKING", businessSlug: business.slug }, new Date(), { sendSms });

    expect(sent[0]?.variables["text-1"]).toBe("Барбершоп Алиф");
  });

  it("signs a code from the platform when no salon is asking", async () => {
    // Account recovery: the owner may have several businesses, so naming one of them would be a guess.
    await requestPhoneVerification({ phone: uniquePhone(), purpose: "PASSWORD_RESET" }, new Date(), { sendSms });
    expect(sent[0]?.variables["text-1"]).toBe("ManClient");

    // An unknown slug is somebody probing, not a salon: the code still goes out, unsigned by any business.
    sent.length = 0;
    await requestPhoneVerification({ phone: uniquePhone(), purpose: "BOOKING", businessSlug: "no-such-salon" }, new Date(), { sendSms });
    expect(sent[0]?.variables["text-1"]).toBe("ManClient");
  });

  it("can send codes without enforcing them, for a two-step rollout", () => {
    process.env.PHONE_VERIFICATION_REQUIRED = "false";
    expect(isPhoneVerificationConfigured()).toBe(true);
    expect(isPhoneVerificationRequired()).toBe(false);
  });

  it("sends a six-digit code as a template and never stores it in plaintext", async () => {
    const phone = uniquePhone();
    const requested = await requestPhoneVerification({ phone, purpose: "BOOKING" }, new Date("2026-08-04T10:00:00.000Z"), { sendSms });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.templateId).toBe("template-code-id");
    const code = sent[0]?.variables["code-1"] ?? "";
    expect(code).toMatch(/^\d{6}$/);

    const stored = await prisma.phoneVerification.findUniqueOrThrow({ where: { id: requested.verificationId } });
    expect(stored.codeHash).not.toContain(code);
    expect(stored.status).toBe("PENDING");
  });

  it("accepts the code once and refuses to spend it twice", async () => {
    const phone = uniquePhone();
    const now = new Date("2026-08-04T10:00:00.000Z");
    const requested = await requestPhoneVerification({ phone, purpose: "BOOKING" }, now, { sendSms });
    const code = sent[0]?.variables["code-1"] ?? "";

    await expect(confirmPhoneVerification({ verificationId: requested.verificationId, phone, code }, now)).resolves.toMatchObject({
      phone,
      purpose: "BOOKING",
    });
    await expect(assertPhoneVerified({ phone, verificationId: requested.verificationId }, now)).resolves.toBeUndefined();

    await consumeVerifiedPhone({ verificationId: requested.verificationId, phone, purpose: "BOOKING" }, now);
    await expect(
      consumeVerifiedPhone({ verificationId: requested.verificationId, phone, purpose: "BOOKING" }, now),
    ).rejects.toBeInstanceOf(PhoneVerificationError);
    // A spent code must not let a second booking through either.
    await expect(assertPhoneVerified({ phone, verificationId: requested.verificationId }, now)).rejects.toMatchObject({
      code: "VERIFICATION_REQUIRED",
    });
  });

  it("refuses a valid code presented for a different number", async () => {
    const phone = uniquePhone();
    const other = uniquePhone();
    const now = new Date("2026-08-04T10:00:00.000Z");
    const requested = await requestPhoneVerification({ phone, purpose: "BOOKING" }, now, { sendSms });
    const code = sent[0]?.variables["code-1"] ?? "";

    await expect(confirmPhoneVerification({ verificationId: requested.verificationId, phone: other, code }, now)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("stops guessing after five wrong codes", async () => {
    const phone = uniquePhone();
    const now = new Date("2026-08-04T10:00:00.000Z");
    const requested = await requestPhoneVerification({ phone, purpose: "BOOKING" }, now, { sendSms });
    const actual = sent[0]?.variables["code-1"] ?? "";
    const wrong = actual === "000000" ? "111111" : "000000";

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(confirmPhoneVerification({ verificationId: requested.verificationId, phone, code: wrong }, now)).rejects.toMatchObject({
        code: "INVALID_CODE",
      });
    }
    await expect(confirmPhoneVerification({ verificationId: requested.verificationId, phone, code: wrong }, now)).rejects.toMatchObject({
      code: "TOO_MANY_ATTEMPTS",
    });
    // The real code is dead too: exhausting the attempts kills the row, not just the guess.
    await expect(confirmPhoneVerification({ verificationId: requested.verificationId, phone, code: actual }, now)).rejects.toMatchObject({
      code: "EXPIRED",
    });
  });

  it("refuses an expired code and lets maintenance clean it up", async () => {
    const phone = uniquePhone();
    const requested = await requestPhoneVerification({ phone, purpose: "BOOKING" }, new Date("2026-08-04T10:00:00.000Z"), { sendSms });
    const code = sent[0]?.variables["code-1"] ?? "";

    // Codes live ten minutes.
    await expect(
      confirmPhoneVerification({ verificationId: requested.verificationId, phone, code }, new Date("2026-08-04T10:11:00.000Z")),
    ).rejects.toMatchObject({ code: "EXPIRED" });

    // A day after the code's own expiry, the row and its hash are gone — measured against the injected
    // clock, so this holds whatever day the suite runs on.
    await runSecurityMaintenance(new Date("2026-08-05T11:00:00.000Z"));
    await expect(prisma.phoneVerification.findUnique({ where: { id: requested.verificationId } })).resolves.toBeNull();
  });

  it("keeps a code that died less than a day ago, so a support question can still be answered", async () => {
    const phone = uniquePhone();
    const requested = await requestPhoneVerification({ phone, purpose: "BOOKING" }, new Date("2026-08-04T10:00:00.000Z"), { sendSms });

    await runSecurityMaintenance(new Date("2026-08-04T20:00:00.000Z"));
    await expect(prisma.phoneVerification.findUnique({ where: { id: requested.verificationId } })).resolves.toMatchObject({
      status: "EXPIRED",
    });
  });

  it("keeps one live code per number and refuses an immediate resend", async () => {
    const phone = uniquePhone();
    const first = await requestPhoneVerification({ phone, purpose: "BOOKING" }, new Date("2026-08-04T10:00:00.000Z"), { sendSms });

    await expect(
      requestPhoneVerification({ phone, purpose: "BOOKING" }, new Date("2026-08-04T10:00:30.000Z"), { sendSms }),
    ).rejects.toMatchObject({ code: "RESEND_TOO_SOON" });

    const second = await requestPhoneVerification({ phone, purpose: "BOOKING" }, new Date("2026-08-04T10:02:00.000Z"), { sendSms });
    expect(second.verificationId).not.toBe(first.verificationId);
    // The replaced code stops working, so a resend does not double the guessing surface.
    await expect(prisma.phoneVerification.findUniqueOrThrow({ where: { id: first.verificationId } })).resolves.toMatchObject({
      status: "EXPIRED",
    });
  });

  it("does not consume the customer's code when the SMS never went out", async () => {
    const phone = uniquePhone();
    await expect(
      requestPhoneVerification({ phone, purpose: "BOOKING" }, new Date("2026-08-04T10:00:00.000Z"), {
        sendSms: async () => {
          throw new Error("gateway unreachable");
        },
      }),
    ).rejects.toMatchObject({ code: "SMS_FAILED" });

    // Nothing PENDING is left behind, so the next attempt is a fresh send rather than a cooldown.
    const rows = await prisma.phoneVerification.findMany({ where: { phone } });
    expect(rows.every((row) => row.status === "EXPIRED")).toBe(true);
    await expect(requestPhoneVerification({ phone, purpose: "BOOKING" }, new Date("2026-08-04T10:00:10.000Z"), { sendSms })).resolves.toMatchObject(
      { verificationId: expect.any(String) },
    );
  });

  it("requires a verification id once enforcement is on", async () => {
    await expect(assertPhoneVerified({ phone: uniquePhone() })).rejects.toMatchObject({ code: "VERIFICATION_REQUIRED" });
  });

  it("never turns a failed spend into an error for the caller", async () => {
    // The booking already exists by the time this runs; a stale id must not surface as a 500.
    await expect(spendPhoneVerification({ phone: uniquePhone(), verificationId: "missing-id" })).resolves.toBeUndefined();
  });
});

/** Verifications are keyed by phone, and the suite shares one database across files. */
function uniquePhone(): string {
  const suffix = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
  return `+992900${suffix}`;
}
