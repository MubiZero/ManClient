import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import {
  BusinessTelegramIntegrationError,
  connectBusinessTelegramBot,
  retryBusinessTelegramWebhook,
  type BusinessTelegramApi,
} from "@/core/integrations/business-telegram-service";
import { prisma } from "@/core/database/prisma";
import { listIntegrationHealth } from "@/core/platform/integration-health";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

const encryptionKey = Buffer.alloc(32, 11).toString("base64");

describe("platform admin telegram integration retry", () => {
  const businessIds: string[] = [];

  beforeEach(() => {
    process.env.INTEGRATION_ENCRYPTION_KEY = encryptionKey;
    process.env.APP_URL = "https://manclient.example";
  });

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    delete process.env.INTEGRATION_ENCRYPTION_KEY;
  });

  it("re-registers the webhook using the stored token and clears the last error", async () => {
    const { integrationId, businessId } = await connectedIntegration();
    await prisma.businessTelegramIntegration.update({
      where: { id: integrationId },
      data: { status: "ERROR", lastWebhookError: "timeout" },
    });

    const telegram = fakeTelegram();
    const result = await retryBusinessTelegramWebhook({ integrationId, actorUserId: randomUUID() }, () => telegram);

    expect(result.status).toBe("ACTIVE");
    expect(telegram.webhooks).toHaveLength(1);
    const stored = await prisma.businessTelegramIntegration.findUniqueOrThrow({ where: { id: integrationId } });
    expect(stored.status).toBe("ACTIVE");
    expect(stored.lastWebhookError).toBeNull();

    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { businessId, type: "telegram.integration.retried" } });
    expect(audit.actorType).toBe("platform_admin");
  });

  it("fails with NOT_CONNECTED for a disconnected integration", async () => {
    const { integrationId } = await connectedIntegration();
    await prisma.businessTelegramIntegration.update({ where: { id: integrationId }, data: { status: "DISCONNECTED" } });

    await expect(
      retryBusinessTelegramWebhook({ integrationId, actorUserId: randomUUID() }, fakeTelegram),
    ).rejects.toEqual(new BusinessTelegramIntegrationError("NOT_CONNECTED"));
  });

  it("fails with NOT_CONNECTED for an unknown integration id", async () => {
    await expect(
      retryBusinessTelegramWebhook({ integrationId: "missing-integration", actorUserId: randomUUID() }, fakeTelegram),
    ).rejects.toEqual(new BusinessTelegramIntegrationError("NOT_CONNECTED"));
  });

  it("surfaces TELEGRAM_UNAVAILABLE when Telegram rejects the webhook call", async () => {
    const { integrationId } = await connectedIntegration();
    const failing: BusinessTelegramApi = {
      async getMe() { return { id: 1, isBot: true, username: "x" }; },
      async setWebhook() { throw new Error("boom"); },
      async setMyCommands() {},
      async deleteWebhook() {},
    };

    await expect(
      retryBusinessTelegramWebhook({ integrationId, actorUserId: randomUUID() }, () => failing),
    ).rejects.toEqual(new BusinessTelegramIntegrationError("TELEGRAM_UNAVAILABLE"));
  });

  it("counts failed messages per business in the platform health listing", async () => {
    const fixture = await createBookingFixture();
    businessIds.push(fixture.business.id);
    const suffix = randomUUID().replace(/\D/g, "").padEnd(9, "2").slice(0, 9);
    const booking = await createPendingBooking(
      {
        businessSlug: fixture.business.slug,
        branchId: fixture.branch.id,
        serviceId: fixture.service.id,
        staffId: fixture.staff.id,
        resourceIds: [],
        startsAt: new Date("2026-08-02T05:00:00.000Z"),
        customer: { name: "Клиент", phone: `+992${suffix}` },
      },
      new Date("2026-08-01T04:00:00.000Z"),
    );
    const user = await prisma.user.create({ data: { email: `retry-msg-${randomUUID()}@example.test`, displayName: "Owner" } });
    await prisma.membership.create({ data: { businessId: fixture.business.id, userId: user.id, role: "OWNER" } });
    const connected = await connectBusinessTelegramBot(
      { businessId: fixture.business.id, actorUserId: user.id, token: `${Math.floor(Math.random() * 100000)}:secret` },
      fakeTelegram(),
    );
    await prisma.message.create({
      data: {
        businessId: fixture.business.id,
        bookingId: booking.bookingId,
        channel: "TELEGRAM",
        kind: "BOOKING_CONFIRMED",
        status: "FAILED",
        scheduledAt: new Date("2026-08-01T04:00:00.000Z"),
      },
    });

    const { items } = await listIntegrationHealth();
    const row = items.find((item) => item.id === connected.id);
    expect(row?.failedMessages).toBeGreaterThanOrEqual(1);
  });

  async function connectedIntegration() {
    const suffix = randomUUID();
    const business = await prisma.business.create({
      data: { name: "Retry Business", slug: `retry-${suffix}` },
    });
    businessIds.push(business.id);
    const user = await prisma.user.create({ data: { email: `retry-${suffix}@example.test`, displayName: "Owner" } });
    await prisma.membership.create({ data: { businessId: business.id, userId: user.id, role: "OWNER" } });

    const connected = await connectBusinessTelegramBot(
      { businessId: business.id, actorUserId: user.id, token: `${Math.floor(Math.random() * 100000)}:secret` },
      fakeTelegram(),
    );

    return { integrationId: connected.id, businessId: business.id };
  }
});

function fakeTelegram(): BusinessTelegramApi & { webhooks: string[] } {
  const fake = {
    webhooks: [] as string[],
    async getMe() {
      return { id: Math.floor(Math.random() * 1_000_000), isBot: true as const, username: `retry_bot_${randomUUID().slice(0, 8)}` };
    },
    async setWebhook(url: string) {
      fake.webhooks.push(url);
    },
    async setMyCommands() {},
    async deleteWebhook() {},
  };
  return fake;
}
