import { z } from "zod";

import { prisma } from "@/core/database/prisma";
import { OnboardingStepError } from "@/core/onboarding/onboarding-step-error";
import { encryptCardNumber } from "@/core/payments/card-encryption";

const inputSchema = z.object({
  businessId: z.string().min(1),
  actorUserId: z.string().min(1),
  recipientCard: z.string().transform(value => value.replace(/\s/g, "")).pipe(z.string().regex(/^\d{16}$/)),
}).strict();

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
