import { prisma } from "@/core/database/prisma";

export async function listAuditEvents(filters: { businessId?: string; type?: string }) {
  return prisma.auditEvent.findMany({
    where: {
      businessId: filters.businessId || undefined,
      type: filters.type || undefined,
    },
    include: { business: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function listAuditEventTypes() {
  const rows = await prisma.auditEvent.findMany({ distinct: ["type"], select: { type: true }, orderBy: { type: "asc" } });
  return rows.map((row) => row.type);
}
