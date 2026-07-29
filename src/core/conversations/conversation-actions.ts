import type { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/core/database/prisma";

type CreateActionInput = {
  businessId: string;
  conversationId: string;
  kind: string;
  payload: Prisma.InputJsonObject;
  expiresAt: Date;
};

export function createConversationAction(input: CreateActionInput) {
  return prisma.conversationAction.create({ data: input, select: { id: true, expiresAt: true } });
}

export async function consumeConversationAction(input: {
  businessId: string;
  conversationId: string;
  actionId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (transaction) => {
    const consumed = await transaction.conversationAction.updateMany({
      where: {
        id: input.actionId,
        businessId: input.businessId,
        conversationId: input.conversationId,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) throw new Error("Conversation action is invalid or expired");
    return transaction.conversationAction.findUniqueOrThrow({
      where: { id: input.actionId },
      select: { kind: true, payload: true },
    });
  }, { isolationLevel: "Serializable" });
}
