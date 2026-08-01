import { prisma } from "@/core/database/prisma";
import { writeAuditEvent } from "@/core/audit/audit-service";

const BUSINESSES_PAGE_SIZE = 50;

export async function listBusinesses(query?: string, page: { cursor?: string | null } = {}) {
  const where = query
    ? { OR: [{ name: { contains: query, mode: "insensitive" as const } }, { slug: { contains: query, mode: "insensitive" as const } }] }
    : undefined;
  const rows = await prisma.business.findMany({
    where,
    include: {
      _count: { select: { branches: true, staffMembers: true, bookings: true } },
      telegramIntegrations: { select: { status: true, botUsername: true }, take: 1, orderBy: { createdAt: "desc" } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: BUSINESSES_PAGE_SIZE + 1,
    ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > BUSINESSES_PAGE_SIZE;
  const items = hasMore ? rows.slice(0, BUSINESSES_PAGE_SIZE) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

export async function listBusinessOptions() {
  return prisma.business.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
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
