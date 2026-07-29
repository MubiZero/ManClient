import { z } from "zod";

import { prisma } from "@/core/database/prisma";
import { encryptCardNumber } from "@/core/payments/card-encryption";

const setupSchema = z.object({
  businessId: z.string().min(1),
  actorUserId: z.string().min(1),
  serviceName: z.string().trim().min(2).max(120),
  durationMinutes: z.coerce.number().int().min(15).max(720),
  amountSomoni: z.string().trim().regex(/^\d{1,7}(?:\.\d{1,2})?$/),
  recipientCard: z.string().transform(value => value.replace(/\s/g, "")).pipe(z.string().regex(/^\d{16}$/)),
}).strict();

export class BusinessSetupError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "FORBIDDEN" | "CONFIGURATION_ERROR") {
    super(code);
    this.name = "BusinessSetupError";
  }
}

export async function completeBusinessSetup(input: z.input<typeof setupSchema>) {
  const parsed = setupSchema.safeParse(input);
  if (!parsed.success) throw new BusinessSetupError("INVALID_INPUT");
  const encryptionKey = process.env.CARD_ENCRYPTION_KEY;
  if (!encryptionKey) throw new BusinessSetupError("CONFIGURATION_ERROR");
  const amountDiram = Math.round(Number(parsed.data.amountSomoni) * 100);
  if (amountDiram < 1) throw new BusinessSetupError("INVALID_INPUT");

  return prisma.$transaction(async transaction => {
    const membership = await transaction.membership.findUnique({
      where: { businessId_userId: { businessId: parsed.data.businessId, userId: parsed.data.actorUserId } },
      include: { staff: true },
    });
    if (!membership || membership.role === "STAFF" || !membership.staff) {
      throw new BusinessSetupError("FORBIDDEN");
    }
    const branch = await transaction.branch.findFirst({
      where: { businessId: parsed.data.businessId },
      orderBy: { createdAt: "asc" },
    });
    if (!branch) throw new BusinessSetupError("INVALID_INPUT");

    await transaction.branch.update({
      where: { id: branch.id },
      data: {
        recipientCardEncrypted: encryptCardNumber(parsed.data.recipientCard, encryptionKey),
        recipientCardLast4: parsed.data.recipientCard.slice(-4),
      },
    });
    return transaction.service.create({
      data: {
        branchId: branch.id,
        name: parsed.data.serviceName,
        durationMinutes: parsed.data.durationMinutes,
        amountDiram,
        staffMembers: { connect: { id: membership.staff.id } },
      },
    });
  });
}
