import { prisma } from "@/core/database/prisma";

const CUSTOMERS_PAGE_SIZE = 50;

export async function listCustomers(input: { businessId: string; search?: string; cursor?: string | null }) {
  const where = {
    businessId: input.businessId,
    bookings: { some: {} },
    ...(input.search
      ? {
          OR: [
            { name: { contains: input.search, mode: "insensitive" as const } },
            { phone: { contains: input.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const rows = await prisma.customer.findMany({
    where,
    include: {
      bookings: {
        select: {
          startsAt: true,
          status: true,
          payment: { select: { status: true, amountDiram: true } },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: CUSTOMERS_PAGE_SIZE + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > CUSTOMERS_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, CUSTOMERS_PAGE_SIZE) : rows;

  const items = page.map((customer) => {
    const totalBookings = customer.bookings.length;
    const totalSpentDiram = customer.bookings.reduce(
      (sum, booking) => sum + (booking.payment?.status === "RECEIPT_ACCEPTED" ? booking.payment.amountDiram : 0),
      0,
    );
    const lastVisit = customer.bookings
      .filter((booking) => booking.status === "CONFIRMED")
      .reduce<Date | null>((latest, booking) => (!latest || booking.startsAt > latest ? booking.startsAt : latest), null);

    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      telegramLinked: Boolean(customer.telegramChatId),
      noShowCount: customer.noShowCount,
      totalBookings,
      totalSpentDiram,
      lastVisit,
    };
  });

  return { items, nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null };
}
