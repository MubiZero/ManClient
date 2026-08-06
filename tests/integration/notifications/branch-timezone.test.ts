import { describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import { buildPayomVariables } from "@/integrations/payom/payom-templates";
import type { PayomSmsMessage } from "@/integrations/payom/payom-client";
import { sendDueBookingReminders } from "@/jobs/send-booking-reminder";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

/**
 * Every branch carries its own `timeZone`, but the delivery paths used to format times against a
 * hardcoded Asia/Dushanbe. The failure was silent and total: a branch in another zone would tell every
 * customer a time that is wrong by whole hours, and nothing in the product would look broken.
 */
describe("branch timezone in customer messages", () => {
  it("renders the SMS template in the branch timezone, not a fixed one", () => {
    const startsAt = new Date("2026-08-02T21:30:00.000Z");

    expect(buildPayomVariables("BOOKING_REMINDER", "ru", { businessName: "Салон", startsAt }).variables).toMatchObject({
      "date-1": "2026-08-03",
      "time-1": "02:30",
    });
    // Same instant, a branch two hours behind Dushanbe: still the same day, different clock time.
    expect(
      buildPayomVariables("BOOKING_REMINDER", "ru", { businessName: "Салон", startsAt, timeZone: "Asia/Tashkent" }).variables,
    ).toMatchObject({
      "date-1": "2026-08-03",
      "time-1": "02:30",
    });
    expect(
      buildPayomVariables("BOOKING_REMINDER", "ru", { businessName: "Салон", startsAt, timeZone: "Europe/Moscow" }).variables,
    ).toMatchObject({
      "date-1": "2026-08-03",
      "time-1": "00:30",
    });
  });

  it("sends a reminder for a Moscow branch in Moscow time", async () => {
    const fixture = await createBookingFixture();
    await prisma.business.update({
      where: { id: fixture.business.id },
      data: { name: "Салон Ветер", smsNotificationsEnabled: true, subscriptionPlan: "STANDARD" },
    });
    // The fixture branch opens 09:00–18:00 on Sundays in its own timezone, so the visit is chosen to
    // sit inside that window in Moscow time rather than in Dushanbe time.
    await prisma.branch.update({ where: { id: fixture.branch.id }, data: { timeZone: "Europe/Moscow" } });

    const pending = await createPendingBooking(
      {
        businessSlug: fixture.business.slug,
        branchId: fixture.branch.id,
        serviceId: fixture.service.id,
        staffId: fixture.staff.id,
        resourceIds: [],
        startsAt: new Date("2026-08-02T09:00:00.000Z"),
        customer: { name: "Мухаммад", phone: "+992900004455" },
      },
      new Date("2026-08-01T04:00:00.000Z"),
    );
    await prisma.booking.update({ where: { id: pending.bookingId }, data: { status: "CONFIRMED" } });
    await prisma.message.create({
      data: {
        businessId: fixture.business.id,
        bookingId: pending.bookingId,
        channel: "SMS",
        kind: "BOOKING_REMINDER",
        scheduledAt: new Date("2026-08-01T04:00:00.000Z"),
      },
    });

    const sent: PayomSmsMessage[] = [];
    await sendDueBookingReminders(
      new Date("2026-08-01T04:05:00.000Z"),
      {
        sendTelegram: async () => { throw new Error("must not send over Telegram"); },
        sendWhatsApp: async () => { throw new Error("must not send over WhatsApp"); },
        sendSms: async (input) => {
          sent.push(input);
          return { externalId: "payom-id", deliveryStatus: "SERVICE_ACCEPTED" };
        },
      },
      { businessId: fixture.business.id },
    );

    // 09:00 UTC is 12:00 in Moscow and 14:00 in Dushanbe: the customer must be told 12:00.
    expect(sent[0]?.variables).toMatchObject({ "date-1": "2026-08-02", "time-1": "12:00" });
  });
});
