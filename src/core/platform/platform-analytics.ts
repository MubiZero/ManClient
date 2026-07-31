import { prisma } from "@/core/database/prisma";
import { bucketByDay, daysAgo } from "@/core/formatting/day-bucket";

export async function loadPlatformOverview(now = new Date()) {
  const since = daysAgo(30, now);

  const [totalBusinesses, activeBusinesses, suspendedBusinesses, attentionPayments, bookings, payments] = await Promise.all([
    prisma.business.count(),
    prisma.business.count({ where: { status: "ACTIVE" } }),
    prisma.business.count({ where: { status: "SUSPENDED" } }),
    prisma.payment.count({ where: { status: "NEEDS_ATTENTION" } }),
    prisma.booking.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.payment.findMany({
      where: { status: "RECEIPT_ACCEPTED", createdAt: { gte: since } },
      select: { createdAt: true, amountDiram: true },
    }),
  ]);

  const bookingsTrend = bucketByDay(bookings, (item) => item.createdAt, () => 1, 30, now);
  const revenueTrend = bucketByDay(payments, (item) => item.createdAt, (item) => item.amountDiram / 100, 30, now);

  return {
    totalBusinesses,
    activeBusinesses,
    suspendedBusinesses,
    attentionPayments,
    bookingsLast30Days: bookings.length,
    revenueLast30DaysDiram: payments.reduce((sum, item) => sum + item.amountDiram, 0),
    bookingsTrend,
    revenueTrend,
  };
}
