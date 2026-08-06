import { prisma } from "@/core/database/prisma";

/**
 * The delivery queues are where a stalled pilot shows first: a scheduler that stopped ticking looks
 * exactly like a quiet evening until you notice the oldest SCHEDULED message is four hours old. So
 * the numbers worth alerting on are backlog *age*, not just depth.
 */

export type QueueMetric = { name: string; help: string; type: "gauge"; samples: Array<{ labels?: Record<string, string>; value: number }> };

export async function collectQueueMetrics(now = new Date()): Promise<QueueMetric[]> {
  const [messagesByStatus, deliveriesByStatus, submissionsByStatus, integrationsByStatus, bookingsByStatus, oldestMessage, oldestDelivery] =
    await Promise.all([
      prisma.message.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.businessNotificationDelivery.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.receiptSubmission.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.businessTelegramIntegration.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.booking.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.message.findFirst({ where: { status: "SCHEDULED", scheduledAt: { lte: now } }, orderBy: { scheduledAt: "asc" }, select: { scheduledAt: true } }),
      prisma.businessNotificationDelivery.findFirst({ where: { status: "SCHEDULED", scheduledAt: { lte: now } }, orderBy: { scheduledAt: "asc" }, select: { scheduledAt: true } }),
    ]);

  const ageSeconds = (scheduledAt: Date | undefined) => (scheduledAt ? Math.max(0, Math.round((now.getTime() - scheduledAt.getTime()) / 1000)) : 0);

  return [
    {
      name: "manclient_customer_messages",
      help: "Customer-facing messages by delivery status",
      type: "gauge",
      samples: messagesByStatus.map((row) => ({ labels: { status: row.status }, value: row._count._all })),
    },
    {
      name: "manclient_business_notification_deliveries",
      help: "Business Telegram notification deliveries by status",
      type: "gauge",
      samples: deliveriesByStatus.map((row) => ({ labels: { status: row.status }, value: row._count._all })),
    },
    {
      name: "manclient_receipt_submissions",
      help: "Receipt submissions by processing status",
      type: "gauge",
      samples: submissionsByStatus.map((row) => ({ labels: { status: row.status }, value: row._count._all })),
    },
    {
      name: "manclient_telegram_integrations",
      help: "Business Telegram integrations by status",
      type: "gauge",
      samples: integrationsByStatus.map((row) => ({ labels: { status: row.status }, value: row._count._all })),
    },
    {
      name: "manclient_bookings",
      help: "Bookings by status",
      type: "gauge",
      samples: bookingsByStatus.map((row) => ({ labels: { status: row.status }, value: row._count._all })),
    },
    {
      name: "manclient_customer_message_backlog_age_seconds",
      help: "Age of the oldest customer message that is due but still SCHEDULED",
      type: "gauge",
      samples: [{ value: ageSeconds(oldestMessage?.scheduledAt) }],
    },
    {
      name: "manclient_business_notification_backlog_age_seconds",
      help: "Age of the oldest business notification delivery that is due but still SCHEDULED",
      type: "gauge",
      samples: [{ value: ageSeconds(oldestDelivery?.scheduledAt) }],
    },
  ];
}

/** Prometheus text exposition format, so any scraper or a plain `curl` can read it. */
export function renderPrometheus(metrics: QueueMetric[]): string {
  const lines: string[] = [];
  for (const metric of metrics) {
    lines.push(`# HELP ${metric.name} ${metric.help}`, `# TYPE ${metric.name} ${metric.type}`);
    if (metric.samples.length === 0) {
      lines.push(`${metric.name} 0`);
      continue;
    }
    for (const sample of metric.samples) {
      const labels = sample.labels
        ? `{${Object.entries(sample.labels)
            .map(([key, value]) => `${key}="${value.replace(/"/g, '\\"')}"`)
            .join(",")}}`
        : "";
      lines.push(`${metric.name}${labels} ${sample.value}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
