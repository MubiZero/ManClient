import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import type { PhoneVerificationPurpose, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/core/database/prisma";
import { logger, maskPhone } from "@/core/observability/logger";
import { assertRateLimit } from "@/core/security/rate-limit";
import { normalizeTajikPhone } from "@/core/formatting/tajik-phone";
import { sendSms } from "@/integrations/payom/payom-client";
import { buildPhoneVerificationSms, findPhoneVerificationTemplateId, PLATFORM_SMS_LABEL } from "@/integrations/payom/payom-templates";

/**
 * Proof that whoever typed a phone number can receive SMS on it. Two things depended on this being
 * missing: anyone could fill a salon's calendar under somebody else's number, and an owner who lost
 * their password had no way back in that did not involve an operator editing the database.
 *
 * The feature is gated on a moderated payom template existing (see findPhoneVerificationTemplateId).
 * Payom moderation takes hours and cannot be rushed, so the switch is a configuration fact rather
 * than a code deploy: with no template ID the booking flow behaves exactly as it did before.
 */

const CODE_TTL_MS = 10 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;
/** How long a verified code stays usable, so a slow last booking step does not force a resend. */
const VERIFIED_TTL_MS = 30 * 60_000;
const MAX_ATTEMPTS = 5;

export type PhoneVerificationErrorCode =
  | "NOT_CONFIGURED"
  | "VERIFICATION_REQUIRED"
  | "INVALID_PHONE"
  | "RESEND_TOO_SOON"
  | "NOT_FOUND"
  | "EXPIRED"
  | "TOO_MANY_ATTEMPTS"
  | "INVALID_CODE"
  | "SMS_FAILED";

export class PhoneVerificationError extends Error {
  constructor(
    public readonly code: PhoneVerificationErrorCode,
    public readonly retryAfterSeconds?: number,
  ) {
    super(code);
    this.name = "PhoneVerificationError";
  }
}

/**
 * Who the code says it is from. A booking names the salon the customer is booking with — that is what
 * makes the SMS make sense to them. Account recovery has no single business to name: the owner may have
 * several, and signing a login code with one salon's name would be both wrong and a phishing pattern.
 */
async function resolveSender(businessSlug: string | null | undefined): Promise<{ id: string | null; label: string }> {
  if (!businessSlug) return { id: null, label: PLATFORM_SMS_LABEL };
  const business = await prisma.business.findUnique({ where: { slug: businessSlug }, select: { id: true, name: true } });
  if (!business) {
    // An unknown slug falls back to the platform rather than failing: the customer still gets their code,
    // and no SMS goes out under a name nobody verified.
    logger.warn("phone_verification.unknown_business", { businessSlug });
    return { id: null, label: PLATFORM_SMS_LABEL };
  }
  return { id: business.id, label: business.name };
}

export function isPhoneVerificationConfigured(): boolean {
  return Boolean(findPhoneVerificationTemplateId() && process.env.PAYOM_API_TOKEN);
}

/**
 * Whether a booking is *rejected* without a verified phone. Separate from "configured" so the flow can
 * be rolled out in two steps: send codes and watch the completion rate first, enforce second.
 * `PHONE_VERIFICATION_REQUIRED=false` keeps it advisory even once the template is live.
 */
export function isPhoneVerificationRequired(): boolean {
  if (!isPhoneVerificationConfigured()) return false;
  return process.env.PHONE_VERIFICATION_REQUIRED?.toLowerCase() !== "false";
}

function codeHash(code: string): string {
  const pepper = process.env.AUTH_SECRET;
  if (!pepper) throw new Error("AUTH_SECRET is required to hash verification codes");
  return createHmac("sha256", pepper).update(code).digest("hex");
}

function matchesHash(code: string, expected: string): boolean {
  const provided = Buffer.from(codeHash(code));
  const stored = Buffer.from(expected);
  return provided.length === stored.length && timingSafeEqual(provided, stored);
}

/** Exported so flows built on top of this one (password recovery) can pass the same fake in tests. */
export type PhoneVerificationSendDependencies = { sendSms: typeof sendSms };

export async function requestPhoneVerification(
  input: { phone: string; purpose: PhoneVerificationPurpose; businessSlug?: string | null },
  now = new Date(),
  dependencies: PhoneVerificationSendDependencies = { sendSms },
): Promise<{ verificationId: string; expiresAt: Date; resendAvailableInSeconds: number }> {
  if (!isPhoneVerificationConfigured()) throw new PhoneVerificationError("NOT_CONFIGURED");
  const phone = normalizeTajikPhone(input.phone);
  if (!phone) throw new PhoneVerificationError("INVALID_PHONE");

  // Per-phone before per-IP (applied by the route): the expensive resource here is the SMS, and it is
  // spent per number regardless of who asks.
  await assertRateLimit("phone.request", `${input.purpose}:${phone}`, now);

  const pending = await prisma.phoneVerification.findFirst({
    where: { phone, purpose: input.purpose, status: "PENDING", expiresAt: { gt: now } },
    orderBy: { lastSentAt: "desc" },
  });
  if (pending && now.getTime() - pending.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
    throw new PhoneVerificationError("RESEND_TOO_SOON", Math.ceil((RESEND_COOLDOWN_MS - (now.getTime() - pending.lastSentAt.getTime())) / 1000));
  }

  // A resend replaces the previous code rather than adding a second valid one: two live codes for one
  // number doubles the guessing surface for no user benefit.
  await prisma.phoneVerification.updateMany({
    where: { phone, purpose: input.purpose, status: "PENDING" },
    data: { status: "EXPIRED" },
  });

  // Resolved from the database by slug, never taken as text from the caller: the name goes into an SMS,
  // and accepting it verbatim would let anyone send codes signed with somebody else's salon.
  const sender = await resolveSender(input.businessSlug);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const verification = await prisma.phoneVerification.create({
    data: {
      phone,
      // Stored so the code can only be spent where it was asked for. The SMS says a salon's name, and a
      // customer who agreed to prove their number to one salon did not agree to prove it to every other.
      businessId: sender.id,
      purpose: input.purpose,
      codeHash: codeHash(code),
      maxAttempts: MAX_ATTEMPTS,
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      lastSentAt: now,
      createdAt: now,
    },
  });

  try {
    await dependencies.sendSms({ telephone: phone, ...buildPhoneVerificationSms(code, sender.label) });
  } catch (error) {
    // The row is expired rather than left PENDING: an undelivered code must not consume the user's
    // one live code and make the next request look like a resend.
    await prisma.phoneVerification.update({ where: { id: verification.id }, data: { status: "EXPIRED" } });
    logger.warn("phone_verification.sms_failed", { phone: maskPhone(phone), purpose: input.purpose, error: error instanceof Error ? error.message : String(error) });
    throw new PhoneVerificationError("SMS_FAILED");
  }

  logger.info("phone_verification.sent", { phone: maskPhone(phone), purpose: input.purpose, verificationId: verification.id, businessId: sender.id ?? undefined });
  return { verificationId: verification.id, expiresAt: verification.expiresAt, resendAvailableInSeconds: RESEND_COOLDOWN_MS / 1000 };
}

export async function confirmPhoneVerification(
  input: { verificationId: string; phone: string; code: string },
  now = new Date(),
): Promise<{ verificationId: string; phone: string; purpose: PhoneVerificationPurpose }> {
  const phone = normalizeTajikPhone(input.phone);
  if (!phone) throw new PhoneVerificationError("INVALID_PHONE");

  const verification = await prisma.phoneVerification.findUnique({ where: { id: input.verificationId } });
  // The phone must match the row: otherwise a valid code for one number could be replayed against a
  // booking for another.
  if (!verification || verification.phone !== phone) throw new PhoneVerificationError("NOT_FOUND");
  if (verification.status === "VERIFIED" && verification.expiresAt > now) {
    return { verificationId: verification.id, phone, purpose: verification.purpose };
  }
  if (verification.status !== "PENDING") throw new PhoneVerificationError("EXPIRED");
  if (verification.expiresAt <= now) {
    await prisma.phoneVerification.update({ where: { id: verification.id }, data: { status: "EXPIRED" } });
    throw new PhoneVerificationError("EXPIRED");
  }

  if (!matchesHash(input.code.trim(), verification.codeHash)) {
    const attempts = verification.attempts + 1;
    const exhausted = attempts >= verification.maxAttempts;
    await prisma.phoneVerification.update({
      where: { id: verification.id },
      data: { attempts, status: exhausted ? "EXPIRED" : "PENDING" },
    });
    throw new PhoneVerificationError(exhausted ? "TOO_MANY_ATTEMPTS" : "INVALID_CODE");
  }

  await prisma.phoneVerification.update({
    where: { id: verification.id },
    data: { status: "VERIFIED", verifiedAt: now, attempts: verification.attempts + 1, expiresAt: new Date(now.getTime() + VERIFIED_TTL_MS) },
  });
  logger.info("phone_verification.confirmed", { phone: maskPhone(phone), purpose: verification.purpose, verificationId: verification.id });
  return { verificationId: verification.id, phone, purpose: verification.purpose };
}

type VerificationDatabase = Pick<Prisma.TransactionClient, "phoneVerification">;

/**
 * Spends a verified code. Single-use by design: one SMS buys one booking, so a leaked verification id
 * cannot be replayed into a calendar full of bookings.
 */
export async function consumeVerifiedPhone(
  input: { verificationId: string; phone: string; purpose: PhoneVerificationPurpose },
  now = new Date(),
  database: VerificationDatabase = prisma,
): Promise<void> {
  const phone = normalizeTajikPhone(input.phone);
  if (!phone) throw new PhoneVerificationError("INVALID_PHONE");

  const claimed = await database.phoneVerification.updateMany({
    where: { id: input.verificationId, phone, purpose: input.purpose, status: "VERIFIED", expiresAt: { gt: now } },
    data: { status: "CONSUMED", consumedAt: now },
  });
  if (claimed.count !== 1) throw new PhoneVerificationError("NOT_FOUND");
}

/** Housekeeping for codes nobody came back for. Runs from the security maintenance job. */
export async function expireStalePhoneVerifications(now = new Date()): Promise<number> {
  const expired = await prisma.phoneVerification.updateMany({
    where: { status: { in: ["PENDING", "VERIFIED"] }, expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
  // Hashes of codes nobody will ever present again are pure liability, so finished rows are dropped a
  // day after the code itself died. Retention hangs off `expiresAt` rather than `updatedAt`: the latter
  // is written by the database from the wall clock, which makes the rule impossible to test against an
  // injected one and ties how long we keep a row to when it was last touched rather than to its life.
  const deleted = await prisma.phoneVerification.deleteMany({
    where: { status: { in: ["EXPIRED", "CONSUMED"] }, expiresAt: { lte: new Date(now.getTime() - 24 * 60 * 60_000) } },
  });
  return expired.count + deleted.count;
}
