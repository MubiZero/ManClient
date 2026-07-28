import { describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import { scheduleBookingReminders } from "@/core/notifications/notification-service";
import { sendDueBookingReminders } from "@/jobs/send-booking-reminder";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("sendDueBookingReminders", () => {
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
