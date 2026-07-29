import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/core/database/prisma";

describe("tenant Telegram schema", () => {
  const runId = randomUUID();
  const businessIds = [`telegram-schema-a-${runId}`, `telegram-schema-b-${runId}`];

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
  });

  it("does not allow one Telegram bot to be connected to two businesses", async () => {
    await createBusinesses();
    await prisma.businessTelegramIntegration.create({
      data: integrationData(businessIds[0], "integration-a", "10001"),
    });

    await expect(
      prisma.businessTelegramIntegration.create({
        data: integrationData(businessIds[1], "integration-b", "10001"),
      }),
    ).rejects.toThrow();
  });

  it("claims each inbound update once per integration", async () => {
    await createBusinesses();
    const integration = await prisma.businessTelegramIntegration.create({
      data: integrationData(businessIds[0], "integration-update", "10002"),
    });
    await prisma.inboundChannelUpdate.create({
      data: { integrationId: integration.id, externalUpdateId: "777" },
    });

    await expect(
      prisma.inboundChannelUpdate.create({
        data: { integrationId: integration.id, externalUpdateId: "777" },
      }),
    ).rejects.toThrow();
  });

  it("keeps each membership Telegram identity unique", async () => {
    await createBusinesses();
    const user = await prisma.user.create({ data: { email: `telegram-identity-${runId}@example.test`, displayName: "Identity User" } });
    const membership = await prisma.membership.create({
      data: { businessId: businessIds[0], userId: user.id, role: "OWNER" },
    });

    await prisma.businessTelegramIdentity.create({
      data: { membershipId: membership.id, telegramUserId: "7001" },
    });
    await expect(prisma.businessTelegramIdentity.create({
      data: { membershipId: membership.id, telegramUserId: "7001" },
    })).rejects.toThrow();
  });

  async function createBusinesses() {
    await prisma.business.createMany({
      data: businessIds.map((id, index) => ({ id, name: `Schema ${index}`, slug: id })),
      skipDuplicates: true,
    });
  }

  function integrationData(businessId: string, publicId: string, botId: string) {
    return {
      businessId,
      publicId: `${publicId}-${runId}`,
      botId,
      botUsername: `${publicId}_bot`,
      botTokenEncrypted: "encrypted-token",
      webhookSecretEncrypted: "encrypted-secret",
      status: "ACTIVE" as const,
    };
  }
});
