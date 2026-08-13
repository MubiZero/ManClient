import { describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import { scheduleCustomerMessage } from "@/core/notifications/notification-service";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

/**
 * SMS is the only channel that costs money, so the two switches in front of it are the two that
 * decide whether a message is free or not. They are checked here through the ladder rather than
 * through a channel-specific scheduler, because the ladder is now the only way a message gets a
 * channel at all.
 */
describe("SMS scheduling gate", () => {
  it("does not fall through to SMS when the business plan does not include the SMS feature, even if enabled", async () => {
    const { fixture, bookingId } = await createConfirmedBooking();
    await prisma.business.update({
      where: { id: fixture.business.id },
      data: { smsNotificationsEnabled: true, subscriptionPlan: "START" },
    });

    const message = await scheduleCustomerMessage({ bookingId, kind: "BOOKING_CONFIRMATION" });

    expect(message).toBeNull();
    await expect(prisma.message.findMany({ where: { bookingId } })).resolves.toEqual([]);
  });

  it("does not fall through to SMS when smsNotificationsEnabled is false, even on a plan with the SMS feature", async () => {
    const { fixture, bookingId } = await createConfirmedBooking();
    await prisma.business.update({
      where: { id: fixture.business.id },
      data: { smsNotificationsEnabled: false, subscriptionPlan: "STANDARD" },
    });

    expect(await scheduleCustomerMessage({ bookingId, kind: "BOOKING_CONFIRMATION" })).toBeNull();
  });

  it("uses SMS when both switches are on and nothing free can reach the customer", async () => {
    const { fixture, bookingId } = await createConfirmedBooking();
    await prisma.business.update({
      where: { id: fixture.business.id },
      data: { smsNotificationsEnabled: true, subscriptionPlan: "STANDARD" },
    });

    const message = await scheduleCustomerMessage({ bookingId, kind: "BOOKING_CONFIRMATION" });

    expect(message).toMatchObject({ channel: "SMS", kind: "BOOKING_CONFIRMATION" });
  });

  it("prefers Telegram over SMS when the customer has a chat, and writes only one message", async () => {
    const { fixture, bookingId } = await createConfirmedBooking();
    await prisma.business.update({
      where: { id: fixture.business.id },
      data: { smsNotificationsEnabled: true, subscriptionPlan: "STANDARD" },
    });
    await prisma.customer.updateMany({ where: { businessId: fixture.business.id }, data: { telegramChatId: "77001" } });

    await scheduleCustomerMessage({ bookingId, kind: "BOOKING_CONFIRMATION" });

    // The point of the ladder: the salon still pays for SMS, and still does not spend it on a
    // customer who is already reachable for free.
    await expect(prisma.message.findMany({ where: { bookingId }, select: { channel: true } })).resolves.toEqual([
      { channel: "TELEGRAM" },
    ]);
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
