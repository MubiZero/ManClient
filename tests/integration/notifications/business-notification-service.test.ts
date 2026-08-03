import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import {
  scheduleBusinessNotification,
  scheduleBusinessNotificationSafely,
} from "@/core/notifications/business-notification-service";
import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("business notification outbox", () => {
  const businessIds: string[] = [];

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
  });

  it("deduplicates an event and can move its scheduled time", async () => {
    const fixture = await createBookingFixture();
    businessIds.push(fixture.business.id);
    const booking = await createPendingBooking({
      businessSlug: fixture.business.slug,
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      resourceIds: [],
      startsAt: new Date("2026-08-02T05:00:00.000Z"),
      customer: { name: "Клиент", phone: "+992900001100" },
    }, new Date("2026-07-29T08:00:00.000Z"));
    const firstAt = new Date("2026-07-29T10:00:00.000Z");
    const secondAt = new Date("2026-07-29T11:00:00.000Z");

    const first = await scheduleBusinessNotification({
      businessId: fixture.business.id,
      bookingId: booking.bookingId,
      kind: "BOOKING_CONFIRMED",
      deduplicationKey: `booking:${booking.bookingId}:confirmed`,
      scheduledAt: firstAt,
    });
    const second = await scheduleBusinessNotification({
      businessId: fixture.business.id,
      bookingId: booking.bookingId,
      kind: "BOOKING_CONFIRMED",
      deduplicationKey: `booking:${booking.bookingId}:confirmed`,
      scheduledAt: secondAt,
    });

    expect(second!.id).toBe(first!.id);
    expect(second!.scheduledAt).toEqual(secondAt);
    await expect(prisma.businessNotification.count({ where: { businessId: fixture.business.id, deduplicationKey: `booking:${booking.bookingId}:confirmed` } })).resolves.toBe(1);
  });

  it("does not turn notification scheduling failure into a domain failure", async () => {
    await expect(scheduleBusinessNotificationSafely({
      businessId: randomUUID(),
      kind: "NEW_BOOKING",
      deduplicationKey: "missing-business",
      scheduledAt: new Date(),
    })).resolves.toBeNull();
  });
});
