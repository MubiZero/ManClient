import { z } from "zod";

import { writeAuditEvent } from "@/core/audit/audit-service";
import { prisma } from "@/core/database/prisma";
import { OnboardingStepError } from "@/core/onboarding/onboarding-step-error";
import { encryptCardNumber } from "@/core/payments/card-encryption";

const inputSchema = z.object({
  businessId: z.string().min(1),
  actorUserId: z.string().min(1),
  recipientCard: z.string().transform(value => value.replace(/\s/g, "")).pipe(z.string().regex(/^\d{16}$/)),
}).strict();

const skipSchema = z.object({ businessId: z.string().min(1), actorUserId: z.string().min(1) }).strict();

export async function savePaymentCard(input: z.input<typeof inputSchema>) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new OnboardingStepError("INVALID_INPUT");

  const membership = await prisma.membership.findUnique({
    where: { businessId_userId: { businessId: parsed.data.businessId, userId: parsed.data.actorUserId } },
    select: { role: true },
  });
  if (!membership || membership.role === "STAFF") throw new OnboardingStepError("FORBIDDEN");

  const encryptionKey = process.env.CARD_ENCRYPTION_KEY;
  if (!encryptionKey) throw new OnboardingStepError("CONFIGURATION_ERROR");

  const branch = await prisma.branch.findFirst({
    where: { businessId: parsed.data.businessId },
    orderBy: { createdAt: "asc" },
    select: { id: true, recipientCardEncrypted: true },
  });
  if (!branch) throw new OnboardingStepError("INVALID_INPUT");
  if (branch.recipientCardEncrypted) throw new OnboardingStepError("ALREADY_COMPLETED");

  await prisma.branch.updateMany({
    where: { id: branch.id, businessId: parsed.data.businessId, recipientCardEncrypted: null },
    data: {
      recipientCardEncrypted: encryptCardNumber(parsed.data.recipientCard, encryptionKey),
      recipientCardLast4: parsed.data.recipientCard.slice(-4),
    },
  });
}

/**
 * The other way out of the payment step: a salon that takes cash on the premises has no card to enter,
 * and before this it could not leave the wizard at all. Prepayment now starts at NONE, so this is the
 * ordinary path rather than the exception — a salon that never asks for money in advance should not be
 * made to hand over bank details to see its own booking page.
 *
 * The card does not disappear with the step. It is set per branch in settings, for the day a salon turns
 * on a deposit, and until then nothing asks for it.
 */
export async function skipPaymentSetup(input: { businessId: string; actorUserId: string }) {
  const parsed = skipSchema.safeParse(input);
  if (!parsed.success) throw new OnboardingStepError("INVALID_INPUT");

  const membership = await prisma.membership.findUnique({
    where: { businessId_userId: { businessId: parsed.data.businessId, userId: parsed.data.actorUserId } },
    select: { role: true },
  });
  if (!membership || membership.role === "STAFF") throw new OnboardingStepError("FORBIDDEN");

  // Idempotent on purpose: a double submit is a repeated decision, not a conflict, and re-stamping the
  // time would misdate a decision the owner made once.
  const skipped = await prisma.business.updateMany({
    where: { id: parsed.data.businessId, paymentSetupSkippedAt: null },
    data: { paymentSetupSkippedAt: new Date() },
  });
  if (skipped.count === 1) {
    await writeAuditEvent({
      businessId: parsed.data.businessId,
      type: "onboarding.payment_skipped",
      actorType: "USER",
      actorId: parsed.data.actorUserId,
    });
  }
}
