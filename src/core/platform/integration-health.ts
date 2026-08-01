import { prisma } from "@/core/database/prisma";

const INTEGRATIONS_PAGE_SIZE = 50;

export async function listIntegrationHealth(page: { cursor?: string | null } = {}) {
  const rows = await prisma.businessTelegramIntegration.findMany({
    select: {
      id: true,
      botUsername: true,
      status: true,
      connectionMethod: true,
      lastWebhookError: true,
      createdAt: true,
      business: { select: { id: true, name: true, slug: true, whatsappPhoneNumberId: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: INTEGRATIONS_PAGE_SIZE + 1,
    ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > INTEGRATIONS_PAGE_SIZE;
  const integrations = hasMore ? rows.slice(0, INTEGRATIONS_PAGE_SIZE) : rows;

  const failedMessageCounts = integrations.length
    ? await prisma.message.groupBy({
        by: ["businessId"],
        where: { status: "FAILED", businessId: { in: integrations.map((integration) => integration.business.id) } },
        _count: { _all: true },
      })
    : [];
  const failedByBusiness = new Map(failedMessageCounts.map((row) => [row.businessId, row._count._all]));

  return {
    items: integrations.map((integration) => ({
      ...integration,
      failedMessages: failedByBusiness.get(integration.business.id) ?? 0,
    })),
    nextCursor: hasMore ? integrations[integrations.length - 1].id : null,
  };
}
