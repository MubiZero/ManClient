import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";

import { POST } from "@/app/api/webhooks/telegram/business/[publicId]/route";
import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import { claimInboundUpdate } from "@/core/integrations/inbound-update-service";
import { encryptSecret } from "@/core/security/secret-encryption";
import { dispatchBusinessTelegramUpdate } from "@/integrations/telegram/business-update-dispatcher";
import { handleTelegramUpdate } from "@/integrations/telegram/update-handler";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

const encryptionKey = Buffer.alloc(32, 12).toString("base64");

describe("tenant Telegram webhook", () => {
  const businessIds: string[] = [];

  beforeEach(() => {
    process.env.INTEGRATION_ENCRYPTION_KEY = encryptionKey;
    process.env.BOOKING_ACTION_SECRET = "booking-action-test-secret-at-least-32-bytes";
  });

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
  });

  it("rejects an unknown integration and a wrong tenant secret", async () => {
    const integration = await createIntegration("tenant-secret");
    const payload = JSON.stringify({ update_id: 1 });

    const unknown = await POST(request(payload, "tenant-secret"), {
      params: Promise.resolve({ publicId: "unknown-public-id" }),
    });
    const unauthorized = await POST(request(payload, "wrong-secret"), {
      params: Promise.resolve({ publicId: integration.publicId }),
    });

    expect(unknown.status).toBe(404);
    expect(unauthorized.status).toBe(401);
  });

  it("claims one Telegram update exactly once under concurrent delivery", async () => {
    const integration = await createIntegration("tenant-secret-2");

    const results = await Promise.all(Array.from({ length: 4 }, () =>
      claimInboundUpdate({ integrationId: integration.id, externalUpdateId: "200" }),
    ));

    expect(results.filter(result => result === "CLAIMED")).toHaveLength(1);
    expect(results.filter(result => result === "BUSY")).toHaveLength(3);
    await expect(prisma.inboundChannelUpdate.count({
      where: { integrationId: integration.id, externalUpdateId: "200" },
    })).resolves.toBe(1);
  });

  it("derives the business from the authenticated integration, not the payload", async () => {
    const integration = await createIntegration("tenant-secret-3");
    const dispatched: Array<{ businessId: string; update: unknown }> = [];

    await dispatchBusinessTelegramUpdate(integration.publicId, {
      update_id: 300,
      businessId: "payload-controlled-business",
    }, async (context, update) => { dispatched.push({ businessId: context.businessId, update }); });

    expect(dispatched[0].businessId).toBe(integration.businessId);
    expect(dispatched[0].businessId).not.toBe("payload-controlled-business");
  });

  it("never confirms another business payment that shares the same chat ID", async () => {
    const first = await createBookingFixture();
    const second = await createBookingFixture();
    businessIds.push(first.business.id, second.business.id);
    const startsAt = new Date("2026-08-02T05:00:00.000Z");
    const firstPending = await createPendingBooking({ businessSlug: first.business.slug, branchId: first.branch.id, serviceId: first.service.id, staffId: first.staff.id, resourceIds: [], startsAt, customer: { name: "First", phone: "+992900001301" } }, new Date("2026-08-01T04:00:00.000Z"));
    const secondPending = await createPendingBooking({ businessSlug: second.business.slug, branchId: second.branch.id, serviceId: second.service.id, staffId: second.staff.id, resourceIds: [], startsAt, customer: { name: "Second", phone: "+992900001302" } }, new Date("2026-08-01T04:00:00.000Z"));
    await prisma.customer.updateMany({
      where: { businessId: { in: [first.business.id, second.business.id] } },
      data: { telegramChatId: "99123" },
    });
    const image = new Uint8Array(await sharp({ create: { width: 20, height: 20, channels: 3, background: "white" } }).jpeg().toBuffer());

    await handleTelegramUpdate(first.business.id, {
      message: { chat: { id: 99123 }, photo: [{ file_id: "receipt" }] },
    }, {
      now: () => new Date("2026-08-01T04:10:00.000Z"),
      sendMessage: async () => undefined,
      downloadPhoto: async () => image,
      storeReceipt: async () => "receipts/tenant-safe.jpg",
      recognizeReceipt: async () => ({ operationNumber: "99123001", amountDiram: 5_000, recipientCardSuffix: "4444", operationAt: new Date("2026-08-01T04:05:00.000Z"), isSuccessful: true }),
    }, firstPending.paymentId);

    await expect(prisma.booking.findUnique({ where: { id: firstPending.bookingId } })).resolves.toMatchObject({ status: "CONFIRMED" });
    await expect(prisma.booking.findUnique({ where: { id: secondPending.bookingId } })).resolves.toMatchObject({ status: "PENDING_PAYMENT" });
  });

  async function createIntegration(secret: string) {
    const suffix = randomUUID();
    const business = await prisma.business.create({ data: { id: `webhook-business-${suffix}`, name: "Webhook Business", slug: `webhook-${suffix}` } });
    businessIds.push(business.id);
    return prisma.businessTelegramIntegration.create({
      data: {
        businessId: business.id,
        publicId: `public-${suffix}`,
        botId: `bot-${suffix}`,
        botUsername: `bot_${suffix.replaceAll("-", "_")}`,
        botTokenEncrypted: encryptSecret("10011:tenant-token", encryptionKey),
        webhookSecretEncrypted: encryptSecret(secret, encryptionKey),
        status: "ACTIVE",
      },
    });
  }
});

function request(body: string, secret: string) {
  return new Request("http://localhost/api/webhooks/telegram/business/test", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
    body,
  });
}
