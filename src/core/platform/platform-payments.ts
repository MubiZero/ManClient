import { prisma } from "@/core/database/prisma";

export async function listAttentionPaymentsAcrossBusinesses() {
  return prisma.payment.findMany({
    where: { status: "NEEDS_ATTENTION" },
    select: {
      id: true,
      amountDiram: true,
      attentionReason: true,
      updatedAt: true,
      business: { select: { id: true, name: true, slug: true } },
      booking: { select: { id: true, startsAt: true, customer: { select: { name: true, phone: true } }, service: { select: { name: true } } } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
}
