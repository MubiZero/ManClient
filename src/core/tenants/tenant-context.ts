import { prisma } from "@/core/database/prisma";

export async function requireBusinessMembership(userId: string, businessId: string) {
  const membership = await prisma.membership.findUnique({
    where: {
      businessId_userId: {
        businessId,
        userId,
      },
    },
  });

  if (!membership) {
    throw new Error("Business membership is required");
  }

  return membership;
}
