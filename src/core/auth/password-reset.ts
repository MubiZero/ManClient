import { hashPassword } from "@/core/auth/password";
import { writeAuditEvent } from "@/core/audit/audit-service";
import { prisma } from "@/core/database/prisma";
import { normalizeTajikPhone } from "@/core/formatting/tajik-phone";
import { logger, maskPhone } from "@/core/observability/logger";
import {
  type PhoneVerificationSendDependencies,
  confirmPhoneVerification,
  consumeVerifiedPhone,
  isPhoneVerificationConfigured,
  PhoneVerificationError,
  requestPhoneVerification,
} from "@/core/security/phone-verification-service";

/**
 * Account recovery for business owners. Until this existed, a forgotten password was an operator
 * editing `User.passwordHash` by hand — the sort of process that works for one pilot and becomes a
 * support queue at ten.
 *
 * The channel is SMS, not email: `User.email` is optional and most owners registered with a phone
 * only, so email would leave exactly the people who need recovery without it.
 */

export type PasswordResetErrorCode = "NOT_CONFIGURED" | "INVALID_PHONE" | "WEAK_PASSWORD";

export class PasswordResetError extends Error {
  constructor(public readonly code: PasswordResetErrorCode) {
    super(code);
    this.name = "PasswordResetError";
  }
}

/**
 * Returns the same shape whether or not an account exists: the response to "reset the password for
 * +992xxxxxxxxx" must not be a way to enumerate which numbers have accounts. The SMS is only sent for
 * a real account, so nobody else is texted either.
 */
export async function requestPasswordReset(
  input: { phone: string },
  now = new Date(),
  dependencies?: PhoneVerificationSendDependencies,
): Promise<{ verificationId: string | null }> {
  if (!isPhoneVerificationConfigured()) throw new PasswordResetError("NOT_CONFIGURED");
  const phone = normalizeTajikPhone(input.phone);
  if (!phone) throw new PasswordResetError("INVALID_PHONE");

  const user = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
  if (!user) {
    logger.info("password_reset.unknown_phone", { phone: maskPhone(phone) });
    return { verificationId: null };
  }

  const verification = await requestPhoneVerification({ phone, purpose: "PASSWORD_RESET" }, now, dependencies);
  logger.info("password_reset.code_sent", { userId: user.id, phone: maskPhone(phone) });
  return { verificationId: verification.verificationId };
}

export async function completePasswordReset(
  input: { verificationId: string; phone: string; code: string; password: string },
  now = new Date(),
): Promise<{ userId: string }> {
  const phone = normalizeTajikPhone(input.phone);
  if (!phone) throw new PasswordResetError("INVALID_PHONE");
  if (input.password.length < 8 || input.password.length > 128) throw new PasswordResetError("WEAK_PASSWORD");

  await confirmPhoneVerification({ verificationId: input.verificationId, phone, code: input.code }, now);
  const user = await prisma.user.findUnique({ where: { phone }, select: { id: true, memberships: { select: { businessId: true }, take: 1 } } });
  // The code was addressed to this number and verified, so a missing user here means the account was
  // deleted between request and confirm. Reported as a bad code rather than "no such account".
  if (!user) throw new PhoneVerificationError("NOT_FOUND");

  const passwordHash = await hashPassword(input.password);
  // Consumed inside the same transaction as the password change: a code must buy exactly one reset,
  // and a retry that raced its way through here would otherwise set the password twice.
  await prisma.$transaction(async (transaction) => {
    await consumeVerifiedPhone({ verificationId: input.verificationId, phone, purpose: "PASSWORD_RESET" }, now, transaction);
    await transaction.user.update({ where: { id: user.id }, data: { passwordHash } });
  });

  // Audit events hang off a business; an owner always has one, and a user without any membership has
  // nothing to audit against. Recovery is exactly the event a business should be able to see later.
  const businessId = user.memberships[0]?.businessId;
  if (businessId) {
    await writeAuditEvent({
      businessId,
      type: "auth.password_reset",
      actorType: "user",
      actorId: user.id,
      metadata: { channel: "SMS", phone: maskPhone(phone) },
    });
  }

  logger.info("password_reset.completed", { userId: user.id, phone: maskPhone(phone) });
  return { userId: user.id };
}
