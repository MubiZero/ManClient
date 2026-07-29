import { prisma } from "@/core/database/prisma";

const bookingView = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  customerId: true,
  service: { select: { name: true, durationMinutes: true } },
  branch: { select: { name: true, timeZone: true } },
  staff: { select: { displayName: true } },
  payment: { select: { id: true, status: true } },
} as const;

export async function listCustomerBookings(input: { businessId: string; telegramChatId: string; cursor?: string | null; limit?: number }) {
  const customer = await prisma.customer.findFirst({ where: { businessId: input.businessId, telegramChatId: input.telegramChatId }, select: { id: true } });
  if (!customer) return { items: [], nextCursor: null };
  const limit = Math.min(Math.max(input.limit ?? 6, 1), 6);
  const rows = await prisma.booking.findMany({
    where: { businessId: input.businessId, customerId: customer.id },
    select: bookingView,
    orderBy: [{ startsAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  return { items, nextCursor: hasMore ? items.at(-1)!.id : null };
}

export async function getCustomerBooking(input: { businessId: string; telegramChatId: string; bookingId: string }) {
  return prisma.booking.findFirst({
    where: { id: input.bookingId, businessId: input.businessId, customer: { telegramChatId: input.telegramChatId } },
    select: bookingView,
  });
}
