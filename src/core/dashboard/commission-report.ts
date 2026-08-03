import { prisma } from "@/core/database/prisma";

const COMMISSIONS_PAGE_SIZE = 50;

export type CommissionFilters = {
  staffId?: string;
  from?: Date;
  to?: Date;
};

function commissionWhere(businessId: string, filters: CommissionFilters) {
  return {
    businessId,
    ...(filters.staffId ? { staffId: filters.staffId } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };
}

export async function listCommissionEntries(
  businessId: string,
  filters: CommissionFilters = {},
  page: { cursor?: string | null } = {},
) {
  const rows = await prisma.commissionEntry.findMany({
    where: commissionWhere(businessId, filters),
    include: {
      staff: { select: { id: true, displayName: true } },
      booking: {
        select: {
          startsAt: true,
          service: { select: { id: true, name: true } },
          customer: { select: { name: true } },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: COMMISSIONS_PAGE_SIZE + 1,
    ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > COMMISSIONS_PAGE_SIZE;
  const items = hasMore ? rows.slice(0, COMMISSIONS_PAGE_SIZE) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

export async function sumCommissionsDiram(businessId: string, filters: CommissionFilters = {}) {
  const result = await prisma.commissionEntry.aggregate({
    where: commissionWhere(businessId, filters),
    _sum: { amountDiram: true },
  });
  return result._sum.amountDiram ?? 0;
}

export async function listCommissionEntriesForExport(businessId: string, filters: CommissionFilters = {}) {
  return prisma.commissionEntry.findMany({
    where: commissionWhere(businessId, filters),
    include: {
      staff: { select: { displayName: true } },
      booking: {
        select: {
          startsAt: true,
          service: { select: { name: true } },
          customer: { select: { name: true } },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 5000,
  });
}
