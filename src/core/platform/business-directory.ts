import { prisma } from "@/core/database/prisma";
import { writeAuditEvent } from "@/core/audit/audit-service";

export async function listBusinesses(query?: string) {
  return prisma.business.findMany({
    where: query
      ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { slug: { contains: query, mode: "insensitive" } }] }
      : undefined,
    include: {
      _count: { select: { branches: true, staffMembers: true, bookings: true } },
      telegramIntegrations: { select: { status: true, botUsername: true }, take: 1, orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function loadBusinessDetail(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      branches: { where: { archivedAt: null }, select: { id: true, name: true } },
      _count: { select: { staffMembers: true, bookings: true, payments: true } },
      telegramIntegrations: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!business) return null;

  const [revenueDiram, auditEvents] = await Promise.all([
    prisma.payment.aggregate({ where: { businessId, status: "RECEIPT_ACCEPTED" }, _sum: { amountDiram: true } }),
    prisma.auditEvent.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return { business, revenueDiram: revenueDiram._sum.amountDiram ?? 0, auditEvents };
}

export async function setBusinessStatus(input: { businessId: string; status: "ACTIVE" | "SUSPENDED"; actorUserId: string }) {
  await prisma.$transaction(async (transaction) => {
    await transaction.business.update({ where: { id: input.businessId }, data: { status: input.status } });
    await writeAuditEvent(
      { businessId: input.businessId, type: input.status === "SUSPENDED" ? "business.suspended" : "business.reactivated", actorType: "platform_admin", actorId: input.actorUserId },
      transaction,
    );
  });
}
