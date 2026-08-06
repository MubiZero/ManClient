import { prisma } from "@/core/database/prisma";
import { writeAuditEvent } from "@/core/audit/audit-service";
import { errorText, logger } from "@/core/observability/logger";
import { createTelegramApi } from "@/integrations/telegram/telegram-api";

const ALERT_TYPE = "integration.alerted";
const REALERT_COOLDOWN_MS = 60 * 60 * 1000;
const FAILED_MESSAGE_THRESHOLD = 5;

export async function checkIntegrationHealthAlerts(now = new Date()) {
  const chatId = process.env.PLATFORM_ADMIN_ALERT_CHAT_ID;
  if (!chatId) return 0;

  const erroredIntegrations = await prisma.businessTelegramIntegration.findMany({
    where: { status: "ERROR" },
    select: { id: true, botUsername: true, lastWebhookError: true, business: { select: { id: true, name: true } } },
  });

  const failedMessageCounts = await prisma.message.groupBy({
    by: ["businessId"],
    where: { status: "FAILED" },
    _count: { _all: true },
    having: { businessId: { _count: { gte: FAILED_MESSAGE_THRESHOLD } } },
  });
  const businesses = failedMessageCounts.length
    ? await prisma.business.findMany({ where: { id: { in: failedMessageCounts.map((row) => row.businessId) } }, select: { id: true, name: true } })
    : [];
  const businessById = new Map(businesses.map((business) => [business.id, business.name]));

  let alerted = 0;
  const telegram = createTelegramApi(requiredPlatformToken());

  for (const integration of erroredIntegrations) {
    const sent = await maybeAlert({
      businessId: integration.business.id,
      dedupeKey: `integration:${integration.id}`,
      message: `⚠️ Интеграция @${integration.botUsername} бизнеса «${integration.business.name}» в статусе ERROR.\n${integration.lastWebhookError ?? "Ошибка вебхука не указана."}`,
      chatId,
      telegram,
      now,
    });
    if (sent) alerted += 1;
  }

  for (const row of failedMessageCounts) {
    const businessName = businessById.get(row.businessId) ?? row.businessId;
    const sent = await maybeAlert({
      businessId: row.businessId,
      dedupeKey: `failed-messages:${row.businessId}`,
      message: `⚠️ У бизнеса «${businessName}» ${row._count._all} сообщений в статусе FAILED.`,
      chatId,
      telegram,
      now,
    });
    if (sent) alerted += 1;
  }

  return alerted;
}

async function maybeAlert(input: {
  businessId: string;
  dedupeKey: string;
  message: string;
  chatId: string;
  telegram: ReturnType<typeof createTelegramApi>;
  now: Date;
}) {
  const recent = await prisma.auditEvent.findFirst({
    where: { businessId: input.businessId, type: ALERT_TYPE, createdAt: { gte: new Date(input.now.getTime() - REALERT_COOLDOWN_MS) }, metadata: { path: ["dedupeKey"], equals: input.dedupeKey } },
    select: { id: true },
  });
  if (recent) return false;

  try {
    await input.telegram.sendMessage(input.chatId, input.message);
  } catch (error) {
    logger.warn("integration_alerts.notify_failed", { businessId: input.businessId, dedupeKey: input.dedupeKey, error: errorText(error) });
    return false;
  }

  await writeAuditEvent({
    businessId: input.businessId,
    type: ALERT_TYPE,
    actorType: "system",
    metadata: { dedupeKey: input.dedupeKey },
  });
  return true;
}

function requiredPlatformToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");
  return token;
}
