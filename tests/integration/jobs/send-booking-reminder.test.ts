import { describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import { scheduleBookingReminders } from "@/core/notifications/notification-service";
import { encryptSecret } from "@/core/security/secret-encryption";
import { sendDueBookingReminders } from "@/jobs/send-booking-reminder";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("sendDueBookingReminders", () => {
  it("sends Telegram reminders with the business bot token", async () => {
    const encryptionKey = Buffer.alloc(32, 14).toString("base64");
    process.env.INTEGRATION_ENCRYPTION_KEY = encryptionKey;
    const { bookingId } = await confirmedTelegramBooking();
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    await prisma.businessTelegramIntegration.create({
      data: {
        businessId: booking.businessId,
        publicId: `reminder-${bookingId}`,
        botId: `reminder-bot-${bookingId}`,
        botUsername: "reminder_bot",
        botTokenEncrypted: encryptSecret("10013:tenant-reminder-token", encryptionKey),
        webhookSecretEncrypted: encryptSecret("reminder-secret", encryptionKey),
        status: "ACTIVE",
      },
    });
    await scheduleBookingReminders(bookingId);
    await prisma.message.updateMany({ where: { bookingId }, data: { scheduledAt: new Date("2026-08-01T04:00:00.000Z") } });
    const tokens: string[] = [];

    await sendDueBookingReminders(new Date("2026-08-01T04:05:00.000Z"), {
      sendTelegram: async (token) => { tokens.push(token); },
      sendWhatsApp: async () => ({ externalId: "unused" }),
    });

    expect(tokens).toEqual(["10013:tenant-reminder-token"]);
  });

  it("skips an expired reminder instead of messaging after the visit time", async () => {
    const { bookingId } = await confirmedTelegramBooking();
    await scheduleBookingReminders(bookingId);

    await sendDueBookingReminders(new Date("2026-08-02T06:00:00.000Z"), {
      sendTelegram: async () => { throw new Error("must not send"); },
      sendWhatsApp: async () => ({ externalId: "unused" }),
    });

    await expect(prisma.message.findFirstOrThrow({ where: { bookingId } })).resolves.toMatchObject({ status: "SKIPPED", attempts: 0 });
  });

  it("bounds failed delivery attempts and records a safe error", async () => {
    const { bookingId } = await confirmedTelegramBooking();
    await scheduleBookingReminders(bookingId);
    await prisma.message.updateMany({ where: { bookingId }, data: { scheduledAt: new Date("2026-08-01T04:00:00.000Z"), attempts: 2 } });

    await sendDueBookingReminders(new Date("2026-08-01T04:05:00.000Z"), {
      sendTelegram: async () => { throw new Error("remote failure with sensitive details"); },
      sendWhatsApp: async () => ({ externalId: "unused" }),
    });

    await expect(prisma.message.findFirstOrThrow({ where: { bookingId } })).resolves.toMatchObject({ status: "FAILED", attempts: 3, lastError: "TELEGRAM delivery failed" });
  });
});

async function confirmedTelegramBooking() {
  const fixture = await createBookingFixture();
  const pending = await createPendingBooking({ businessSlug: fixture.business.slug, branchId: fixture.branch.id, serviceId: fixture.service.id, staffId: fixture.staff.id, resourceIds: [], startsAt: new Date("2026-08-02T05:00:00.000Z"), customer: { name: "Мухаммад", phone: "+992900001122" } }, new Date("2026-08-01T04:00:00.000Z"));
  await prisma.booking.update({ where: { id: pending.bookingId }, data: { status: "CONFIRMED", customer: { update: { telegramChatId: `chat-${pending.bookingId}` } } } });
  return pending;
}
