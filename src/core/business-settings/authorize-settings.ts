import type { Prisma } from "@/generated/prisma/client";

import { SettingsError } from "@/core/business-settings/settings-error";

export async function requireSettingsAccess(
  transaction: Prisma.TransactionClient,
  input: { businessId: string; actorUserId: string },
) {
  const membership = await transaction.membership.findUnique({
    where: { businessId_userId: { businessId: input.businessId, userId: input.actorUserId } },
    select: { id: true, role: true },
  });
  if (!membership || membership.role === "STAFF") throw new SettingsError("FORBIDDEN");
  return membership;
}
