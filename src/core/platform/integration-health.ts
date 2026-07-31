import { prisma } from "@/core/database/prisma";

export async function listIntegrationHealth() {
  const [integrations, failedMessageCounts] = await Promise.all([
    prisma.businessTelegramIntegration.findMany({
      select: {
        id: true,
        botUsername: true,
        status: true,
        connectionMethod: true,
        lastWebhookError: true,
        createdAt: true,
        business: { select: { id: true, name: true, slug: true, whatsappPhoneNumberId: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.message.groupBy({ by: ["businessId"], where: { status: "FAILED" }, _count: { _all: true } }),
  ]);

  const failedByBusiness = new Map(failedMessageCounts.map((row) => [row.businessId, row._count._all]));

  return integrations.map((integration) => ({
    ...integration,
    failedMessages: failedByBusiness.get(integration.business.id) ?? 0,
  }));
}
