import { describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import { scheduleSmsConfirmation } from "@/core/notifications/notification-service";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("SMS scheduling gate", () => {
  it("does not schedule an SMS confirmation when the business plan does not include the SMS feature, even if enabled", async () => {
    const { fixture, bookingId } = await createConfirmedBooking();
    await prisma.business.update({
      where: { id: fixture.business.id },
      data: { smsNotificationsEnabled: true, subscriptionPlan: "START" },
    });

    const message = await scheduleSmsConfirmation(bookingId);

    expect(message).toBeNull();
    const stored = await prisma.message.findUnique({
      where: { bookingId_channel_kind: { bookingId, channel: "SMS", kind: "BOOKING_CONFIRMATION" } },
    });
    expect(stored).toBeNull();
  });

  it("does not schedule an SMS confirmation when smsNotificationsEnabled is false, even on a plan with the SMS feature", async () => {
    const { fixture, bookingId } = await createConfirmedBooking();
    await prisma.business.update({
      where: { id: fixture.business.id },
      data: { smsNotificationsEnabled: false, subscriptionPlan: "STANDARD" },
    });

    const message = await scheduleSmsConfirmation(bookingId);

    expect(message).toBeNull();
  });

  it("schedules an SMS confirmation when smsNotificationsEnabled is true and the plan includes the SMS feature", async () => {
    const { fixture, bookingId } = await createConfirmedBooking();
    await prisma.business.update({
      where: { id: fixture.business.id },
      data: { smsNotificationsEnabled: true, subscriptionPlan: "STANDARD" },
    });

    const message = await scheduleSmsConfirmation(bookingId);

    expect(message).not.toBeNull();
    const stored = await prisma.message.findUnique({
      where: { bookingId_channel_kind: { bookingId, channel: "SMS", kind: "BOOKING_CONFIRMATION" } },
    });
    expect(stored?.channel).toBe("SMS");
    expect(stored?.kind).toBe("BOOKING_CONFIRMATION");
  });
});

async function createConfirmedBooking() {
  const fixture = await createBookingFixture();
  const pending = await createPendingBooking(
    {
      businessSlug: fixture.business.slug,
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      resourceIds: [],
      startsAt: new Date("2026-08-02T05:00:00.000Z"),
      customer: { name: "Мухаммад", phone: "+992900001122" },
    },
    new Date("2026-08-01T04:00:00.000Z"),
  );
  await prisma.booking.update({ where: { id: pending.bookingId }, data: { status: "CONFIRMED" } });
  return { fixture, bookingId: pending.bookingId };
}
