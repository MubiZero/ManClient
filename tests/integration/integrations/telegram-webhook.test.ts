import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { POST } from "@/app/api/webhooks/telegram/route";
import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import { createBookingActionToken } from "@/core/bookings/booking-action-token";
import { handleTelegramUpdate } from "@/integrations/telegram/update-handler";
import type { TelegramReplyMarkup } from "@/integrations/telegram/telegram-client";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("Telegram webhook", () => {
  it("retires the legacy global customer webhook", async () => {
    const response = await POST();

    expect(response.status).toBe(410);
  });

  it("links a chat with a signed token and confirms its booking from a receipt photo", async () => {
    process.env.BOOKING_ACTION_SECRET = "booking-action-test-secret-at-least-32-bytes";
    const fixture = await createBookingFixture();
    const pending = await createPendingBooking({
      businessSlug: fixture.business.slug,
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      resourceIds: [],
      startsAt: new Date("2026-08-02T05:00:00.000Z"),
      customer: { name: "Мухаммад", phone: "+992900001122" },
    }, new Date("2026-08-01T04:00:00.000Z"));
    const token = createBookingActionToken({ paymentId: pending.paymentId, action: "link_payment", expiresAt: new Date("2026-08-01T05:00:00.000Z") });
    const messages: string[] = [];
    const callbacks: string[] = [];
    const image = new Uint8Array(await sharp({ create: { width: 20, height: 20, channels: 3, background: "white" } }).jpeg().toBuffer());
    const dependencies = {
      now: () => new Date("2026-08-01T04:10:00.000Z"),
      sendMessage: async (_chatId: string, text: string, replyMarkup?: TelegramReplyMarkup) => {
        messages.push(text);
        const callback = replyMarkup && "inline_keyboard" in replyMarkup
          ? replyMarkup.inline_keyboard.flat().find(({ callback_data }) => callback_data)?.callback_data
          : undefined;
        if (callback) callbacks.push(callback);
      },
      downloadPhoto: async () => image,
      storeReceipt: async () => "receipts/test/receipt.jpg",
      recognizeReceipt: async () => ({
        operationNumber: "1895624290",
        amountDiram: 5_000,
        recipientCardSuffix: "4444",
        operationAt: new Date("2026-08-01T04:05:00.000Z"),
        isSuccessful: true,
      }),
    };

    await handleTelegramUpdate(fixture.business.id, { message: { chat: { id: 99201 }, text: `/start ${token}` } }, dependencies);
    await handleTelegramUpdate(fixture.business.id, { message: { chat: { id: 99201 }, photo: [{ file_id: "small" }, { file_id: "large" }] } }, dependencies, pending.paymentId);

    await expect(prisma.booking.findUnique({ where: { id: pending.bookingId } })).resolves.toMatchObject({ status: "CONFIRMED" });
    expect(messages.at(-1)).toContain("Запись подтверждена");
    expect(callbacks[0].length).toBeLessThanOrEqual(64);

    await handleTelegramUpdate(fixture.business.id, { callback_query: { data: callbacks[0], message: { chat: { id: 99201 } } } }, dependencies);
    await expect(prisma.booking.findUnique({ where: { id: pending.bookingId } })).resolves.toMatchObject({ status: "CANCELLED" });
  });

  it("keeps payment confirmed when the confirmation message delivery fails", async () => {
    process.env.BOOKING_ACTION_SECRET = "booking-action-test-secret-at-least-32-bytes";
    const fixture = await createBookingFixture();
    const pending = await createPendingBooking({ businessSlug: fixture.business.slug, branchId: fixture.branch.id, serviceId: fixture.service.id, staffId: fixture.staff.id, resourceIds: [], startsAt: new Date("2026-08-02T05:00:00.000Z"), customer: { name: "Мухаммад", phone: "+992900001122" } }, new Date("2026-08-01T04:00:00.000Z"));
    const customer = await prisma.customer.findFirstOrThrow({ where: { businessId: fixture.business.id, phone: "+992900001122" } });
    await prisma.customer.update({ where: { id: customer.id }, data: { telegramChatId: "99202" } });
    const image = new Uint8Array(await sharp({ create: { width: 20, height: 20, channels: 3, background: "white" } }).jpeg().toBuffer());

    await handleTelegramUpdate(fixture.business.id, { message: { chat: { id: 99202 }, photo: [{ file_id: "receipt" }] } }, {
      now: () => new Date("2026-08-01T04:10:00.000Z"),
      sendMessage: async () => { throw new Error("Telegram unavailable"); },
      downloadPhoto: async () => image,
      storeReceipt: async () => "receipts/test/failed-delivery.jpg",
      recognizeReceipt: async () => ({ operationNumber: "1895624295", amountDiram: 5_000, recipientCardSuffix: "4444", operationAt: new Date("2026-08-01T04:05:00.000Z"), isSuccessful: true }),
    }, pending.paymentId);

    await expect(prisma.payment.findUnique({ where: { id: pending.paymentId } })).resolves.toMatchObject({ status: "RECEIPT_ACCEPTED" });
    await expect(prisma.booking.findUnique({ where: { id: pending.bookingId } })).resolves.toMatchObject({ status: "CONFIRMED" });
    await expect(prisma.message.findFirstOrThrow({ where: { bookingId: pending.bookingId, kind: "BOOKING_CONFIRMATION", channel: "TELEGRAM" } })).resolves.toMatchObject({ status: "FAILED" });
  });
});
