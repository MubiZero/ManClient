import { describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import type { PayomSmsMessage } from "@/integrations/payom/payom-client";
import { sendDueBookingReminders } from "@/jobs/send-booking-reminder";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

/**
 * Payom takes a moderated template ID plus placeholder values, never free text. These tests pin the
 * payload the job hands to the gateway, because a wrong placeholder name is not an error there —
 * payom cheerfully delivers an SMS reading "{date-1}" to the customer.
 */
describe("SMS delivery", () => {
  it("sends a reminder as a template with Dushanbe-local date and time", async () => {
    const { bookingId } = await smsBooking({ status: "CONFIRMED" });
    await scheduleSms(bookingId, "BOOKING_REMINDER");
    const sent = await runJob();

    expect(sent).toEqual([
      {
        telephone: "+992900001122",
        templateId: "0dee934e-86e4-41a1-9471-9b1da8566d12",
        // The visit is 05:00 UTC; Dushanbe is UTC+5 and is the only timezone the product serves.
        variables: { "text-1": "Барбершоп Алиф", "date-1": "2026-08-02", "time-1": "10:00" },
      },
    ]);
  });

  it("picks the Tajik template from the customer locale", async () => {
    const { bookingId } = await smsBooking({ status: "CONFIRMED", locale: "tg" });
    await scheduleSms(bookingId, "BOOKING_REMINDER");
    const sent = await runJob();

    expect(sent[0]?.templateId).toBe("68f754ae-1006-4121-bfc2-188b8ebc1bdf");
  });

  it("omits a placeholder the approved template does not contain", async () => {
    const { bookingId } = await smsBooking({ status: "PENDING_PAYMENT" });
    await scheduleSms(bookingId, "PAYMENT_REJECTED");
    const sent = await runJob();

    // "{text-1}: чек по записи {date-1} не принят" has no time placeholder.
    expect(sent[0]?.variables).toEqual({ "text-1": "Барбершоп Алиф", "date-1": "2026-08-02" });
  });

  it("skips a kind that has no approved template instead of failing it three times", async () => {
    const { bookingId } = await smsBooking({ status: "CONFIRMED" });
    // Review requests carry a link, which payom forbids in template text, so they can never be SMS.
    const message = await scheduleSms(bookingId, "REVIEW_REQUEST");
    const sent = await runJob();

    expect(sent).toEqual([]);
    await expect(prisma.message.findUniqueOrThrow({ where: { id: message.id } })).resolves.toMatchObject({
      status: "SKIPPED",
      attempts: 0,
    });
  });

  it("keeps the gateway's rejection reason so a bad payload is diagnosable", async () => {
    const { bookingId } = await smsBooking({ status: "CONFIRMED" });
    const message = await scheduleSms(bookingId, "BOOKING_REMINDER");

    await sendDueBookingReminders(new Date("2026-08-01T04:05:00.000Z"), {
      sendTelegram: async () => {},
      sendWhatsApp: async () => ({ externalId: "unused" }),
      sendSms: async () => { throw new Error('templateMessage.variables[date-1]: должно быть в формате Y-m-d'); },
    });

    await expect(prisma.message.findUniqueOrThrow({ where: { id: message.id } })).resolves.toMatchObject({
      status: "SCHEDULED",
      attempts: 1,
      lastError: "SMS delivery failed",
    });
  });
});

async function runJob(): Promise<PayomSmsMessage[]> {
  const sent: PayomSmsMessage[] = [];
  await sendDueBookingReminders(new Date("2026-08-01T04:05:00.000Z"), {
    sendTelegram: async () => { throw new Error("must not send over Telegram"); },
    sendWhatsApp: async () => { throw new Error("must not send over WhatsApp"); },
    sendSms: async (input) => {
      sent.push(input);
      return { externalId: "payom-message-id", deliveryStatus: "SERVICE_ACCEPTED" };
    },
  });
  return sent;
}

async function scheduleSms(bookingId: string, kind: string) {
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  return prisma.message.create({
    data: {
      businessId: booking.businessId,
      bookingId,
      channel: "SMS",
      kind,
      scheduledAt: new Date("2026-08-01T04:00:00.000Z"),
    },
  });
}

async function smsBooking({ status, locale = "ru" }: { status: "CONFIRMED" | "PENDING_PAYMENT"; locale?: string }) {
  const fixture = await createBookingFixture();
  await prisma.business.update({
    where: { id: fixture.business.id },
    data: { name: "Барбершоп Алиф", smsNotificationsEnabled: true, subscriptionPlan: "STANDARD" },
  });
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
  const booking = await prisma.booking.update({ where: { id: pending.bookingId }, data: { status } });
  await prisma.customer.update({ where: { id: booking.customerId }, data: { telegramLocale: locale } });
  return { fixture, bookingId: pending.bookingId };
}
