import { afterEach, describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import { scheduleCustomerMessage } from "@/core/notifications/notification-service";
import { sendDueBookingReminders } from "@/jobs/send-booking-reminder";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

/**
 * What happens when the cheap channel turns out not to work.
 *
 * Choosing one channel per message is only safe if the message can still find the customer when that
 * channel is a dead end — otherwise saving 0,045 сомони costs a visit, which is a far worse trade.
 */
describe("channel escalation", () => {
  const businessIds: string[] = [];
  afterEach(async () => { await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } }); });

  const scheduledAt = new Date("2026-08-01T04:00:00.000Z");
  const now = new Date("2026-08-01T04:05:00.000Z");

  it("hands the message down to SMS when the salon's Telegram bot is gone, and sends it there", async () => {
    const { businessId, bookingId } = await confirmedBooking({ telegramChatId: "5150", smsNotificationsEnabled: true });
    businessIds.push(businessId);

    // Telegram is chosen because the customer has a chat — but the salon never connected a bot, so
    // nothing can actually be sent through it.
    const scheduled = await scheduleCustomerMessage({ bookingId, kind: "BOOKING_CONFIRMATION", scheduledAt });
    expect(scheduled).toMatchObject({ channel: "TELEGRAM" });

    const sms: string[] = [];
    const dependencies = {
      sendTelegram: async () => { throw new Error("must not be reached"); },
      sendWhatsApp: async () => ({ externalId: "unused" }),
      sendSms: async (input: { telephone: string }) => { sms.push(input.telephone); return { externalId: "payom-1", deliveryStatus: "SENT" }; },
    };

    // First sweep discovers the dead rung and writes the next one; the second sweep delivers it.
    await sendDueBookingReminders(now, dependencies, { businessId });
    await sendDueBookingReminders(now, dependencies, { businessId });

    expect(sms).toEqual(["+992900004411"]);
    // Ordered by the enum, which is the ladder itself: the rung that was tried first, then the one it
    // was handed down to.
    const messages = await prisma.message.findMany({ where: { bookingId }, orderBy: { channel: "asc" }, select: { channel: true, status: true, lastError: true } });
    expect(messages).toEqual([
      { channel: "TELEGRAM", status: "SKIPPED", lastError: "TELEGRAM: business Telegram bot is unavailable" },
      { channel: "SMS", status: "SENT", lastError: null },
    ]);
  });

  it("stops at the bottom rung instead of looping, and says so", async () => {
    const { businessId, bookingId } = await confirmedBooking({ telegramChatId: "5151", smsNotificationsEnabled: false });
    businessIds.push(businessId);

    // Nothing below Telegram is available: no WhatsApp, and the salon does not pay for SMS.
    await scheduleCustomerMessage({ bookingId, kind: "BOOKING_CONFIRMATION", scheduledAt });
    await sendDueBookingReminders(now, {
      sendTelegram: async () => { throw new Error("must not be reached"); },
      sendWhatsApp: async () => { throw new Error("must not be reached"); },
      sendSms: async () => { throw new Error("must not be reached"); },
    }, { businessId });

    await expect(prisma.message.findMany({ where: { bookingId }, select: { channel: true, status: true } })).resolves.toEqual([
      { channel: "TELEGRAM", status: "SKIPPED" },
    ]);
  });
});

async function confirmedBooking(input: { telegramChatId: string; smsNotificationsEnabled: boolean }) {
  const fixture = await createBookingFixture();
  const pending = await createPendingBooking(
    {
      businessSlug: fixture.business.slug,
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      resourceIds: [],
      startsAt: new Date("2026-08-02T05:00:00.000Z"),
      customer: { name: "Мухаммад", phone: "+992900004411" },
    },
    new Date("2026-08-01T03:00:00.000Z"),
  );
  await prisma.business.update({
    where: { id: fixture.business.id },
    data: { smsNotificationsEnabled: input.smsNotificationsEnabled, subscriptionPlan: "STANDARD", subscriptionStatus: "ACTIVE" },
  });
  await prisma.booking.update({
    where: { id: pending.bookingId },
    data: { status: "CONFIRMED", customer: { update: { telegramChatId: input.telegramChatId } } },
  });
  return { businessId: fixture.business.id, bookingId: pending.bookingId };
}
