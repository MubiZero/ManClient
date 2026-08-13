import type { QueueMetric } from "@/core/observability/queue-metrics";
import { prisma } from "@/core/database/prisma";

/**
 * The five numbers the pilot has to start collecting now, so that in a quarter the decisions are made
 * from facts. The queue metrics next door say whether the machine is running; these say whether the
 * business under it works.
 *
 * 1. What SMS costs, per salon — the only variable cost there is, and today nobody knows it.
 * 2. Share of customers reachable on Telegram — decides how much the free channels can actually carry.
 * 3. Subscription receipts settled automatically, and how long the manual ones take — the price of
 *    hand-run billing, and the early warning for when it stops scaling.
 * 4. Salons with at least one booking this week — churn shows here three to six weeks before a salon
 *    stops paying.
 * 5. Salons that ever paid, and customers who came back — the answer to "tool or marketplace".
 */

const DAY_MS = 24 * 60 * 60_000;
/** A month for money, a week for liveness, a quarter for whether anybody comes back. */
const COST_WINDOW_DAYS = 30;
const ACTIVITY_WINDOW_DAYS = 7;
const RETURN_WINDOW_DAYS = 90;

/**
 * 0,045 сомони per message at the time of writing, in diram, and configurable because it is payom's
 * number rather than ours: a tariff change must not need a deploy, and a threefold error here moves the
 * unit economics from "profitable" to "deeply loss-making".
 */
const DEFAULT_SMS_PRICE_DIRAM = 4.5;

export async function collectBusinessMetrics(now = new Date()): Promise<QueueMetric[]> {
  const costSince = daysBefore(now, COST_WINDOW_DAYS);
  const activeSince = daysBefore(now, ACTIVITY_WINDOW_DAYS);
  const returnSince = daysBefore(now, RETURN_WINDOW_DAYS);

  const [smsByBusiness, customers, receipts, manualReviews, activeBusinesses, businessCount, paidBusinesses, bookingsByCustomer] =
    await Promise.all([
      prisma.smsCharge.groupBy({ by: ["businessId", "purpose"], where: { sentAt: { gte: costSince } }, _count: { _all: true } }),
      prisma.customer.groupBy({ by: ["businessId"], _count: { _all: true } }),
      prisma.subscriptionReceipt.groupBy({ by: ["status"], where: { createdAt: { gte: costSince } }, _count: { _all: true } }),
      prisma.subscriptionReceipt.findMany({
        where: { createdAt: { gte: costSince }, reviewedAt: { not: null } },
        select: { createdAt: true, reviewedAt: true },
      }),
      prisma.booking.findMany({ where: { createdAt: { gte: activeSince } }, select: { businessId: true }, distinct: ["businessId"] }),
      prisma.business.count(),
      prisma.subscriptionInvoice.findMany({ where: { paidAt: { not: null } }, select: { businessId: true }, distinct: ["businessId"] }),
      prisma.booking.groupBy({ by: ["customerId"], where: { createdAt: { gte: returnSince } }, _count: { _all: true } }),
    ]);

  const customersWithTelegram = await prisma.customer.groupBy({
    by: ["businessId"],
    where: { telegramChatId: { not: null } },
    _count: { _all: true },
  });

  const smsPrice = Number(process.env.SMS_PRICE_DIRAM ?? DEFAULT_SMS_PRICE_DIRAM);
  const smsTotalByBusiness = new Map<string, number>();
  for (const row of smsByBusiness) {
    const key = row.businessId ?? "platform";
    smsTotalByBusiness.set(key, (smsTotalByBusiness.get(key) ?? 0) + row._count._all);
  }
  const telegramByBusiness = new Map(customersWithTelegram.map(row => [row.businessId, row._count._all]));
  // A customer who booked more than once inside the window is a customer who came back. Counted per
  // customer rather than per phone: the same person at two salons is two relationships, not one.
  const returningCustomers = bookingsByCustomer.filter(row => row._count._all > 1).length;

  return [
    {
      name: "manclient_sms_sent_30d",
      help: "SMS the platform paid for in the last 30 days, by business and purpose",
      type: "gauge",
      samples: smsByBusiness.map(row => ({
        labels: { businessId: row.businessId ?? "platform", purpose: row.purpose },
        value: row._count._all,
      })),
    },
    {
      name: "manclient_sms_cost_diram_30d",
      help: `Cost of those SMS in diram, at ${smsPrice} diram per message (SMS_PRICE_DIRAM)`,
      type: "gauge",
      samples: [...smsTotalByBusiness].map(([businessId, count]) => ({ labels: { businessId }, value: count * smsPrice })),
    },
    {
      name: "manclient_customers",
      help: "Customers per business, split by whether the free Telegram channel can reach them",
      type: "gauge",
      samples: customers.flatMap(row => {
        const withTelegram = telegramByBusiness.get(row.businessId) ?? 0;
        return [
          { labels: { businessId: row.businessId, telegram: "yes" }, value: withTelegram },
          { labels: { businessId: row.businessId, telegram: "no" }, value: row._count._all - withTelegram },
        ];
      }),
    },
    {
      name: "manclient_subscription_receipts_30d",
      help: "Subscription receipts of the last 30 days by outcome: ACCEPTED is the automatic one",
      type: "gauge",
      samples: receipts.map(row => ({ labels: { status: row.status }, value: row._count._all })),
    },
    {
      name: "manclient_subscription_review_minutes",
      help: "Minutes between a receipt arriving and a human deciding on it, averaged over 30 days",
      type: "gauge",
      samples: [{ value: averageMinutes(manualReviews) }],
    },
    {
      name: "manclient_active_businesses_7d",
      help: "Businesses with at least one booking created in the last 7 days",
      type: "gauge",
      samples: [{ value: activeBusinesses.length }],
    },
    {
      name: "manclient_businesses",
      help: "All registered businesses, and how many of them have ever paid an invoice",
      type: "gauge",
      samples: [
        { labels: { state: "registered" }, value: businessCount },
        { labels: { state: "ever_paid" }, value: paidBusinesses.length },
      ],
    },
    {
      name: "manclient_customers_90d",
      help: "Customers who booked in the last 90 days, and how many of them booked more than once",
      type: "gauge",
      samples: [
        { labels: { kind: "booked" }, value: bookingsByCustomer.length },
        { labels: { kind: "returned" }, value: returningCustomers },
      ],
    },
  ];
}

/** Zero when nothing was reviewed: an average over no receipts is not a number worth inventing. */
function averageMinutes(rows: Array<{ createdAt: Date; reviewedAt: Date | null }>): number {
  const durations = rows.flatMap(row => (row.reviewedAt ? [row.reviewedAt.getTime() - row.createdAt.getTime()] : []));
  if (durations.length === 0) return 0;
  return Math.round(durations.reduce((total, value) => total + value, 0) / durations.length / 60_000);
}

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}
