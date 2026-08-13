import { afterEach, describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import { scheduleCustomerMessage } from "@/core/notifications/notification-service";
import { encryptSecret } from "@/core/security/secret-encryption";
import { sendDueBookingReminders } from "@/jobs/send-booking-reminder";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("customer Telegram notifications", () => {
  const businessIds: string[] = [];
  afterEach(async () => { await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } }); });

  it("delivers a localized durable payment decision through the tenant bot", async () => {
    const fixture = await createBookingFixture();
    businessIds.push(fixture.business.id);
    const pending = await createPendingBooking({ businessSlug: fixture.business.slug, branchId: fixture.branch.id, serviceId: fixture.service.id, staffId: fixture.staff.id, resourceIds: [], startsAt: new Date("2026-08-02T05:00:00.000Z"), customer: { name: "Мизоҷ", phone: "+992900001421" } }, new Date("2026-08-01T04:00:00.000Z"));
    await prisma.booking.update({ where: { id: pending.bookingId }, data: { status: "CONFIRMED", customer: { update: { telegramChatId: "421", telegramLocale: "tg" } } } });
    const key = Buffer.alloc(32, 21).toString("base64");
    process.env.INTEGRATION_ENCRYPTION_KEY = key;
    await prisma.businessTelegramIntegration.create({ data: { businessId: fixture.business.id, publicId: `public-${pending.bookingId}`, botId: `bot-${pending.bookingId}`, botUsername: "customer_notice_bot", botTokenEncrypted: encryptSecret("100:tenant-token", key), status: "ACTIVE" } });
    const now = new Date("2026-08-01T04:10:00.000Z");
    await scheduleCustomerMessage({ bookingId: pending.bookingId, kind: "PAYMENT_APPROVED", scheduledAt: now });
    const delivered: string[] = [];

    await sendDueBookingReminders(now, { sendTelegram: async (_token, _chatId, text) => { delivered.push(text); }, sendWhatsApp: async () => ({ externalId: "unused" }), sendSms: async () => ({ externalId: "unused", deliveryStatus: "SENT" }) });

    expect(delivered).toEqual(["Пардохт тасдиқ шуд. Сабти шумо тасдиқ шудааст."]);
    await expect(prisma.message.findFirstOrThrow({ where: { bookingId: pending.bookingId, kind: "PAYMENT_APPROVED" } })).resolves.toMatchObject({ status: "SENT", attempts: 1 });
  });
});
