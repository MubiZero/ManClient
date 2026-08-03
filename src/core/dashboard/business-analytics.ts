import { prisma } from "@/core/database/prisma";
import { bucketByDay, daysAgo } from "@/core/formatting/day-bucket";

export async function loadBusinessAnalytics(businessId: string, now = new Date()) {
  const since = daysAgo(30, now);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [bookings, acceptedPayments, bookingsThisMonth, revenueThisMonth, cancelledOrExpiredThisMonth] = await Promise.all([
    prisma.booking.findMany({ where: { businessId, createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.payment.findMany({
      where: { businessId, status: "RECEIPT_ACCEPTED", createdAt: { gte: since } },
      select: { createdAt: true, amountDiram: true },
    }),
    prisma.booking.count({ where: { businessId, createdAt: { gte: monthStart } } }),
    prisma.payment.aggregate({ where: { businessId, status: "RECEIPT_ACCEPTED", createdAt: { gte: monthStart } }, _sum: { amountDiram: true } }),
    prisma.booking.count({ where: { businessId, createdAt: { gte: monthStart }, status: { in: ["CANCELLED", "EXPIRED"] } } }),
  ]);

  const bookingsTrend = bucketByDay(bookings, (item) => item.createdAt, () => 1, 30, now);
  const revenueTrend = bucketByDay(acceptedPayments, (item) => item.createdAt, (item) => item.amountDiram / 100, 30, now);

  const cancellationRate = bookingsThisMonth > 0 ? (cancelledOrExpiredThisMonth / bookingsThisMonth) * 100 : 0;

  return {
    bookingsLast30Days: bookings.length,
    revenueLast30DaysDiram: acceptedPayments.reduce((sum, item) => sum + item.amountDiram, 0),
    bookingsThisMonth,
    revenueThisMonthDiram: revenueThisMonth._sum.amountDiram ?? 0,
    cancelledOrExpiredThisMonth,
    cancellationRate,
    bookingsTrend,
    revenueTrend,
  };
}
