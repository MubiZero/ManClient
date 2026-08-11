import { prisma } from "@/core/database/prisma";

const AUDIT_EVENTS_PAGE_SIZE = 50;

/** Shown in the business column for platform-wide events, which belong to no single salon. */
export const PLATFORM_SCOPE = "Платформа";

export async function listAuditEvents(filters: { businessId?: string; type?: string }, page: { cursor?: string | null } = {}) {
  const rows = await prisma.auditEvent.findMany({
    where: {
      businessId: filters.businessId || undefined,
      type: filters.type || undefined,
    },
    include: { business: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: AUDIT_EVENTS_PAGE_SIZE + 1,
    ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > AUDIT_EVENTS_PAGE_SIZE;
  const items = hasMore ? rows.slice(0, AUDIT_EVENTS_PAGE_SIZE) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

export async function listAuditEventTypes() {
  const rows = await prisma.auditEvent.findMany({ distinct: ["type"], select: { type: true }, orderBy: { type: "asc" } });
  return rows.map((row) => row.type);
}
