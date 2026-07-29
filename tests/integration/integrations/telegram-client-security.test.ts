import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createBookingActionToken } from "@/core/bookings/booking-action-token";
import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import { failInboundUpdate, claimInboundUpdate } from "@/core/integrations/inbound-update-service";
import { handleBusinessTelegramUpdate, type BusinessTelegramHandlerDependencies } from "@/integrations/telegram/business-update-handler";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("client Telegram security", () => {
  const businessIds: string[] = [];
  beforeEach(() => { process.env.BOOKING_ACTION_SECRET = "booking-action-test-secret-at-least-32-bytes"; });
  afterEach(async () => { await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } }); });

  it("binds a signed deep link to the exact payment and refuses customer flow in groups", async () => {
    const fixture = await createBookingFixture();
    businessIds.push(fixture.business.id);
    const integration = await prisma.businessTelegramIntegration.create({ data: { businessId: fixture.business.id, publicId: randomUUID(), botId: randomUUID(), botUsername: `bot_${randomUUID().replaceAll("-", "_")}`, status: "ACTIVE" } });
    const pending = await createPendingBooking({ businessSlug: fixture.business.slug, branchId: fixture.branch.id, serviceId: fixture.service.id, staffId: fixture.staff.id, resourceIds: [], startsAt: new Date("2026-08-02T05:00:00.000Z"), customer: { name: "Клиент", phone: "+992900001401" } }, new Date("2026-08-01T04:00:00.000Z"));
    const token = createBookingActionToken({ paymentId: pending.paymentId, action: "link_payment", expiresAt: new Date("2026-08-01T05:00:00.000Z") });
    const messages: string[] = [];
    const dependencies = deps(messages);
    const context = { businessId: fixture.business.id, integrationId: integration.id, token: "unused" };

    await handleBusinessTelegramUpdate(context, { update_id: 1, message: { chat: { id: 811, type: "private" }, from: { id: 811 }, text: `/start ${token}` } }, dependencies);
    const session = await prisma.conversationSession.findFirstOrThrow({ where: { conversation: { businessId: fixture.business.id, externalChatId: "811" }, active: true } });
    expect(session).toMatchObject({ state: "AWAITING_PAYMENT", data: expect.objectContaining({ bookingId: pending.bookingId, paymentId: pending.paymentId }) });

    await handleBusinessTelegramUpdate(context, { update_id: 2, message: { chat: { id: -100, type: "group" }, from: { id: 811 }, text: "Моё имя" } }, dependencies);
    await expect(prisma.conversation.count({ where: { businessId: fixture.business.id, externalChatId: "-100" } })).resolves.toBe(0);
    expect(messages.at(-1)).toContain("личном чате");
  });

  it("reclaims a failed inbound update but not a completed or active one", async () => {
    const fixture = await createBookingFixture();
    businessIds.push(fixture.business.id);
    const integration = await prisma.businessTelegramIntegration.create({ data: { businessId: fixture.business.id, publicId: randomUUID(), botId: randomUUID(), botUsername: `bot_${randomUUID().replaceAll("-", "_")}`, status: "ACTIVE" } });
    const key = { integrationId: integration.id, externalUpdateId: "77" };
    expect(await claimInboundUpdate(key)).toBe("CLAIMED");
    expect(await claimInboundUpdate(key)).toBe("BUSY");
    await failInboundUpdate(key);
    expect(await claimInboundUpdate(key)).toBe("CLAIMED");
  });
});

function deps(messages: string[]): BusinessTelegramHandlerDependencies {
  return {
    now: () => new Date("2026-08-01T04:10:00.000Z"),
    sendMessage: async (_chatId, text) => { messages.push(text); },
    downloadPhoto: async () => new Uint8Array(),
    storeReceipt: async () => "unused",
    recognizeReceipt: async () => { throw new Error("unused"); },
  };
}
