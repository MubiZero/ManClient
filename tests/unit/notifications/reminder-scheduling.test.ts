import { describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import { scheduleBookingReminder } from "@/core/notifications/notification-service";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("scheduleBookingReminders", () => {
  it("schedules one Telegram reminder 24 hours before a confirmed booking", async () => {
    const fixture = await createBookingFixture();
    const pending = await createPendingBooking({ businessSlug: fixture.business.slug, branchId: fixture.branch.id, serviceId: fixture.service.id, staffId: fixture.staff.id, resourceIds: [], startsAt: new Date("2026-08-02T05:00:00.000Z"), customer: { name: "Мухаммад", phone: "+992900001122" } }, new Date("2026-08-01T04:00:00.000Z"));
    await prisma.booking.update({ where: { id: pending.bookingId }, data: { status: "CONFIRMED", customer: { update: { telegramChatId: "99201" } } } });

    await scheduleBookingReminder(pending.bookingId);

    await expect(prisma.message.findMany({ where: { bookingId: pending.bookingId } })).resolves.toMatchObject([
      { channel: "TELEGRAM", kind: "BOOKING_REMINDER", status: "SCHEDULED", scheduledAt: new Date("2026-08-01T05:00:00.000Z") },
    ]);
  });
});
