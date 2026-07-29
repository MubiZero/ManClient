import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BusinessTelegramIntegrationError,
  connectBusinessTelegramBot,
  disconnectBusinessTelegramBot,
  getBusinessTelegramStatus,
  rotateBusinessTelegramBot,
  type BusinessTelegramApi,
} from "@/core/integrations/business-telegram-service";
import { prisma } from "@/core/database/prisma";

const encryptionKey = Buffer.alloc(32, 11).toString("base64");

describe("business Telegram integration lifecycle", () => {
  const businessIds: string[] = [];

  beforeEach(() => {
    process.env.INTEGRATION_ENCRYPTION_KEY = encryptionKey;
    process.env.APP_URL = "https://manclient.example";
  });

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    delete process.env.INTEGRATION_ENCRYPTION_KEY;
  });

  it("connects a verified bot without storing or returning its token", async () => {
    const fixture = await createBusiness("OWNER");
    const telegram = fakeTelegram({ id: 10001, username: "demo_business_bot" });

    const result = await connectBusinessTelegramBot({
      businessId: fixture.business.id,
      actorUserId: fixture.user.id,
      token: "10001:business-secret",
    }, telegram);

    expect(result).toMatchObject({ status: "ACTIVE", botUsername: "demo_business_bot" });
    expect(result).not.toHaveProperty("token");
    const stored = await prisma.businessTelegramIntegration.findUniqueOrThrow({
      where: { id: result.id },
    });
    expect(stored.botTokenEncrypted).not.toContain("business-secret");
    expect(stored.webhookSecretEncrypted).not.toBeNull();
    expect(telegram.webhooks).toEqual([
      `https://manclient.example/api/webhooks/telegram/business/${result.publicId}`,
    ]);
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { businessId: fixture.business.id, type: "telegram.integration.connected" },
    });
    expect(JSON.stringify(audit.metadata)).not.toContain("business-secret");
  });

  it("allows only an owner or administrator to connect a bot", async () => {
    const fixture = await createBusiness("STAFF");

    await expect(connectBusinessTelegramBot({
      businessId: fixture.business.id,
      actorUserId: fixture.user.id,
      token: "10002:business-secret",
    }, fakeTelegram({ id: 10002, username: "staff_bot" }))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a bot already connected to another business without identifying it", async () => {
    const first = await createBusiness("OWNER");
    const second = await createBusiness("OWNER");
    await connectBusinessTelegramBot({
      businessId: first.business.id,
      actorUserId: first.user.id,
      token: "10003:first-secret",
    }, fakeTelegram({ id: 10003, username: "shared_bot" }));

    const error = await connectBusinessTelegramBot({
      businessId: second.business.id,
      actorUserId: second.user.id,
      token: "10003:second-secret",
    }, fakeTelegram({ id: 10003, username: "shared_bot" })).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BusinessTelegramIntegrationError);
    expect((error as BusinessTelegramIntegrationError).code).toBe("BOT_ALREADY_CONNECTED");
    expect((error as Error).message).not.toContain(first.business.id);
  });

  it("rolls back a failed webhook registration", async () => {
    const fixture = await createBusiness("ADMIN");
    const telegram = fakeTelegram({ id: 10004, username: "unavailable_bot" });
    telegram.setWebhook = async () => { throw new Error("network down"); };

    await expect(connectBusinessTelegramBot({
      businessId: fixture.business.id,
      actorUserId: fixture.user.id,
      token: "10004:business-secret",
    }, telegram)).rejects.toMatchObject({ code: "TELEGRAM_UNAVAILABLE" });
    await expect(prisma.businessTelegramIntegration.count({
      where: { businessId: fixture.business.id },
    })).resolves.toBe(0);
  });

  it("rotates only after the replacement webhook succeeds and disconnects safely", async () => {
    const fixture = await createBusiness("OWNER");
    const firstTelegram = fakeTelegram({ id: 10005, username: "first_bot" });
    const connected = await connectBusinessTelegramBot({
      businessId: fixture.business.id,
      actorUserId: fixture.user.id,
      token: "10005:first-secret",
    }, firstTelegram);
    const failingReplacement = fakeTelegram({ id: 10006, username: "second_bot" });
    failingReplacement.setWebhook = async () => { throw new Error("network down"); };

    await expect(rotateBusinessTelegramBot({
      businessId: fixture.business.id,
      actorUserId: fixture.user.id,
      token: "10006:second-secret",
    }, failingReplacement, firstTelegram)).rejects.toMatchObject({ code: "TELEGRAM_UNAVAILABLE" });
    await expect(getBusinessTelegramStatus(fixture.business.id)).resolves.toMatchObject({
      botUsername: "first_bot",
      status: "ACTIVE",
    });

    const replacement = fakeTelegram({ id: 10006, username: "second_bot" });
    await rotateBusinessTelegramBot({
      businessId: fixture.business.id,
      actorUserId: fixture.user.id,
      token: "10006:second-secret",
    }, replacement, firstTelegram);
    await disconnectBusinessTelegramBot({
      businessId: fixture.business.id,
      actorUserId: fixture.user.id,
    }, replacement);

    const stored = await prisma.businessTelegramIntegration.findUniqueOrThrow({
      where: { id: connected.id },
    });
    expect(stored).toMatchObject({ status: "DISCONNECTED", botTokenEncrypted: null, webhookSecretEncrypted: null });
    expect(replacement.deleteWebhookCalls).toBe(1);
  });

  async function createBusiness(role: "OWNER" | "ADMIN" | "STAFF") {
    const suffix = randomUUID();
    const business = await prisma.business.create({
      data: { id: `telegram-business-${suffix}`, name: "Telegram Business", slug: `telegram-${suffix}` },
    });
    businessIds.push(business.id);
    const user = await prisma.user.create({
      data: { email: `telegram-${suffix}@example.test`, displayName: "Owner" },
    });
    await prisma.membership.create({ data: { businessId: business.id, userId: user.id, role } });
    return { business, user };
  }
});

function fakeTelegram(identity: { id: number; username: string }): BusinessTelegramApi & {
  webhooks: string[];
  deleteWebhookCalls: number;
} {
  const fake = {
    webhooks: [] as string[],
    deleteWebhookCalls: 0,
    async getMe() {
      return { id: identity.id, isBot: true as const, username: identity.username };
    },
    async setWebhook(url: string) {
      fake.webhooks.push(url);
    },
    async deleteWebhook() {
      fake.deleteWebhookCalls += 1;
    },
  };
  return fake;
}
