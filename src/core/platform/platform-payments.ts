import { prisma } from "@/core/database/prisma";

const ATTENTION_PAYMENTS_PAGE_SIZE = 50;

export async function listAttentionPaymentsAcrossBusinesses(page: { cursor?: string | null } = {}) {
  const rows = await prisma.payment.findMany({
    where: { status: "NEEDS_ATTENTION" },
    select: {
      id: true,
      amountDiram: true,
      attentionReason: true,
      updatedAt: true,
      business: { select: { id: true, name: true, slug: true } },
      booking: { select: { id: true, startsAt: true, customer: { select: { name: true, phone: true } }, service: { select: { name: true } } } },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: ATTENTION_PAYMENTS_PAGE_SIZE + 1,
    ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > ATTENTION_PAYMENTS_PAGE_SIZE;
  const items = hasMore ? rows.slice(0, ATTENTION_PAYMENTS_PAGE_SIZE) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}
