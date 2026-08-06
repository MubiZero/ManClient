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
    const { bookingId, businessId } = await smsBooking({ status: "CONFIRMED" });
    await scheduleSms(bookingId, "BOOKING_REMINDER");
    const sent = await runJob(businessId);

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
    const { bookingId, businessId } = await smsBooking({ status: "CONFIRMED", locale: "tg" });
    await scheduleSms(bookingId, "BOOKING_REMINDER");
    const sent = await runJob(businessId);

    expect(sent[0]?.templateId).toBe("68f754ae-1006-4121-bfc2-188b8ebc1bdf");
  });

  it("omits a placeholder the approved template does not contain", async () => {
    const { bookingId, businessId } = await smsBooking({ status: "PENDING_PAYMENT" });
    await scheduleSms(bookingId, "PAYMENT_REJECTED");
    const sent = await runJob(businessId);

    // "{text-1}: чек по записи {date-1} не принят" has no time placeholder.
    expect(sent[0]?.variables).toEqual({ "text-1": "Барбершоп Алиф", "date-1": "2026-08-02" });
  });

  it("skips a kind that has no approved template instead of failing it three times", async () => {
    const { bookingId, businessId } = await smsBooking({ status: "CONFIRMED" });
    // Review requests carry a link, which payom forbids in template text, so they can never be SMS.
    const message = await scheduleSms(bookingId, "REVIEW_REQUEST");
    const sent = await runJob(businessId);

    expect(sent).toEqual([]);
    await expect(prisma.message.findUniqueOrThrow({ where: { id: message.id } })).resolves.toMatchObject({
      status: "SKIPPED",
      attempts: 0,
    });
  });

  it("keeps the gateway's rejection reason so a bad payload is diagnosable", async () => {
    const { bookingId, businessId } = await smsBooking({ status: "CONFIRMED" });
    const message = await scheduleSms(bookingId, "BOOKING_REMINDER");

    await sendDueBookingReminders(new Date("2026-08-01T04:05:00.000Z"), {
      sendTelegram: async () => {},
      sendWhatsApp: async () => ({ externalId: "unused" }),
      sendSms: async () => { throw new Error('templateMessage.variables[date-1]: должно быть в формате Y-m-d'); },
    }, { businessId });

    await expect(prisma.message.findUniqueOrThrow({ where: { id: message.id } })).resolves.toMatchObject({
      status: "SCHEDULED",
      attempts: 1,
      // The gateway's own words, not a generic "SMS delivery failed": support reads this column to
      // tell a rejected template apart from an unreachable gateway.
      lastError: "SMS: templateMessage.variables[date-1]: должно быть в формате Y-m-d",
    });
  });
});

async function runJob(businessId: string): Promise<PayomSmsMessage[]> {
  const sent: PayomSmsMessage[] = [];
  await sendDueBookingReminders(new Date("2026-08-01T04:05:00.000Z"), {
    sendTelegram: async () => { throw new Error("must not send over Telegram"); },
    sendWhatsApp: async () => { throw new Error("must not send over WhatsApp"); },
    sendSms: async (input) => {
      sent.push(input);
      return { externalId: "payom-message-id", deliveryStatus: "SERVICE_ACCEPTED" };
    },
  }, { businessId });
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
  return { fixture, bookingId: pending.bookingId, businessId: fixture.business.id };
}

/**
 * A freed-slot alert has no booking behind it, so the job has to resolve its recipient and its time
 * from the waitlist entry instead.
 */
describe("waitlist slot alerts", () => {
  it("sends the freed slot over SMS with the waitlist template", async () => {
    const entry = await notifiedWaitlistEntry();
    await prisma.message.create({
      data: {
        businessId: entry.businessId,
        waitlistEntryId: entry.id,
        channel: "SMS",
        kind: "WAITLIST_SLOT_FREED",
        scheduledAt: new Date("2026-08-01T04:00:00.000Z"),
      },
    });

    const sent = await runJob(entry.businessId);

    expect(sent).toEqual([
      {
        telephone: "+992900001122",
        templateId: "bdb4b7f4-3a79-4f79-9e7c-453c2d02da74",
        variables: { "text-1": "Барбершоп Алиф", "date-1": "2026-08-02", "time-1": "10:00" },
      },
    ]);
  });

  it("skips the alert when the entry was already converted into a booking", async () => {
    const entry = await notifiedWaitlistEntry();
    await prisma.waitlistEntry.update({ where: { id: entry.id }, data: { status: "CONVERTED" } });
    const message = await prisma.message.create({
      data: {
        businessId: entry.businessId,
        waitlistEntryId: entry.id,
        channel: "SMS",
        kind: "WAITLIST_SLOT_FREED",
        scheduledAt: new Date("2026-08-01T04:00:00.000Z"),
      },
    });

    const sent = await runJob(entry.businessId);

    expect(sent).toEqual([]);
    await expect(prisma.message.findUniqueOrThrow({ where: { id: message.id } })).resolves.toMatchObject({ status: "SKIPPED" });
  });
});

async function notifiedWaitlistEntry() {
  const fixture = await createBookingFixture();
  await prisma.business.update({
    where: { id: fixture.business.id },
    data: { name: "Барбершоп Алиф", smsNotificationsEnabled: true, subscriptionPlan: "STANDARD" },
  });
  const customer = await prisma.customer.create({
    data: { businessId: fixture.business.id, name: "Мухаммад", phone: "+992900001122" },
  });
  return prisma.waitlistEntry.create({
    data: {
      businessId: fixture.business.id,
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      customerId: customer.id,
      desiredFrom: new Date("2026-08-02T00:00:00.000Z"),
      desiredTo: new Date("2026-08-03T00:00:00.000Z"),
      status: "NOTIFIED",
      notifiedAt: new Date("2026-08-01T04:00:00.000Z"),
      freedStartsAt: new Date("2026-08-02T05:00:00.000Z"),
    },
  });
}
