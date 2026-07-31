import { prisma } from "@/core/database/prisma";
import { bucketByDay, daysAgo } from "@/core/formatting/day-bucket";

export async function loadOverviewAnalytics(businessId: string, staffId: string | undefined, now = new Date()) {
  const since = daysAgo(30, now);
  const bookingScope = { businessId, ...(staffId ? { staffId } : {}) };

  const [bookings, payments] = await Promise.all([
    prisma.booking.findMany({ where: { ...bookingScope, createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.payment.findMany({
      where: { businessId, status: "RECEIPT_ACCEPTED", createdAt: { gte: since } },
      select: { createdAt: true, amountDiram: true },
    }),
  ]);

  return {
    bookingsTrend: bucketByDay(bookings, (item) => item.createdAt, () => 1, 30, now),
    revenueTrend: bucketByDay(payments, (item) => item.createdAt, (item) => item.amountDiram / 100, 30, now),
    revenueLast7DaysDiram: payments
      .filter((item) => item.createdAt >= daysAgo(7, now))
      .reduce((sum, item) => sum + item.amountDiram, 0),
  };
}

export async function loadRecentActivity(businessId: string) {
  const [notifications, auditEvents] = await Promise.all([
    prisma.businessNotification.findMany({
      where: { businessId },
      include: { booking: { select: { customer: { select: { name: true } }, service: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.auditEvent.findMany({
      where: { businessId, type: { in: ["booking.cancelled", "booking.rescheduled", "payment.review_rejected"] } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const feed = [
    ...notifications.map((item) => ({
      id: `notification-${item.id}`,
      createdAt: item.createdAt,
      label: activityLabel(item.kind, item.booking?.customer.name, item.booking?.service.name),
    })),
    ...auditEvents.map((item) => ({ id: `audit-${item.id}`, createdAt: item.createdAt, label: activityLabel(item.type) })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return feed.slice(0, 8);
}

function activityLabel(kind: string, customerName?: string, serviceName?: string): string {
  const subject = customerName && serviceName ? `${customerName} · ${serviceName}` : undefined;
  const labels: Record<string, string> = {
    "booking.confirmed": "Новая запись подтверждена",
    "booking.cancelled": "Запись отменена",
    "booking.rescheduled": "Запись перенесена",
    "payment.review_rejected": "Чек отклонён",
    "payment.needs_attention": "Чек требует проверки",
  };
  const label = labels[kind] ?? kind;
  return subject ? `${label}: ${subject}` : label;
}
