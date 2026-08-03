import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import { cancelBusinessBooking } from "@/core/booking-operations/booking-command-service";
import { prisma } from "@/core/database/prisma";
import { approvePaymentReview, rejectPaymentReview } from "@/core/payments/payment-review-service";
import type { WhatsAppTemplateMessage } from "@/integrations/whatsapp/whatsapp-client";
import { sendDueBookingReminders } from "@/jobs/send-booking-reminder";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("WhatsApp send triggers", () => {
  it("sends a WhatsApp confirmation using the business's confirmation template once payment is approved", async () => {
    const { fixture, bookingId, actorUserId } = await createConfirmedBusinessWorkspace();
    await prisma.business.update({
      where: { id: fixture.business.id },
      data: {
        whatsappPhoneNumberId: "phone-number-id",
        whatsappTemplateName: "booking_reminder",
        whatsappConfirmationTemplateName: "booking_confirmed",
      },
    });
    const paymentId = await createReviewablePayment(fixture, bookingId);

    await approvePaymentReview({ businessId: fixture.business.id, actorUserId, paymentId });
    await prisma.message.updateMany({ where: { bookingId }, data: { scheduledAt: new Date("2026-08-01T04:00:00.000Z") } });

    const sent: WhatsAppTemplateMessage[] = [];
    await sendDueBookingReminders(new Date("2026-08-01T04:05:00.000Z"), {
      sendTelegram: async () => {},
      sendWhatsApp: async (input) => { sent.push(input); return { externalId: "ext-confirmation" }; },
      sendSms: async () => ({ externalId: "unused", deliveryStatus: "SENT" }),
    });

    expect(sent).toContainEqual(
      expect.objectContaining({ phoneNumberId: "phone-number-id", templateName: "booking_confirmed", to: "+992900001122" }),
    );
  });

  it("does not send a WhatsApp confirmation when the business has no phone number id configured", async () => {
    const { fixture, bookingId, actorUserId } = await createConfirmedBusinessWorkspace();
    const paymentId = await createReviewablePayment(fixture, bookingId);

    await approvePaymentReview({ businessId: fixture.business.id, actorUserId, paymentId });
    await prisma.message.updateMany({ where: { bookingId }, data: { scheduledAt: new Date("2026-08-01T04:00:00.000Z") } });

    const sent: WhatsAppTemplateMessage[] = [];
    await sendDueBookingReminders(new Date("2026-08-01T04:05:00.000Z"), {
      sendTelegram: async () => {},
      sendWhatsApp: async (input) => { sent.push(input); return { externalId: "unused" }; },
      sendSms: async () => ({ externalId: "unused", deliveryStatus: "SENT" }),
    });

    expect(sent).toEqual([]);
  });

  it("sends a WhatsApp cancellation using the business's cancellation template when a booking is cancelled", async () => {
    const { fixture, bookingId, actorUserId } = await createConfirmedBusinessWorkspace();
    await prisma.business.update({
      where: { id: fixture.business.id },
      data: {
        whatsappPhoneNumberId: "phone-number-id",
        whatsappTemplateName: "booking_reminder",
        whatsappCancellationTemplateName: "booking_cancelled",
      },
    });
    await prisma.booking.update({ where: { id: bookingId }, data: { status: "CONFIRMED" } });

    await cancelBusinessBooking({ businessId: fixture.business.id, actorUserId, bookingId, reason: "Клиент попросил отменить" });
    await prisma.message.updateMany({ where: { bookingId }, data: { scheduledAt: new Date("2026-08-01T04:00:00.000Z") } });

    const sent: WhatsAppTemplateMessage[] = [];
    await sendDueBookingReminders(new Date("2026-08-01T04:05:00.000Z"), {
      sendTelegram: async () => {},
      sendWhatsApp: async (input) => { sent.push(input); return { externalId: "ext-cancellation" }; },
      sendSms: async () => ({ externalId: "unused", deliveryStatus: "SENT" }),
    });

    expect(sent).toEqual([
      expect.objectContaining({ phoneNumberId: "phone-number-id", templateName: "booking_cancelled", to: "+992900001122" }),
    ]);
  });

  it("sends a WhatsApp payment-rejected message reusing the reminder template when a receipt is rejected", async () => {
    const { fixture, bookingId, actorUserId } = await createConfirmedBusinessWorkspace();
    await prisma.business.update({
      where: { id: fixture.business.id },
      data: {
        whatsappPhoneNumberId: "phone-number-id",
        whatsappTemplateName: "booking_reminder",
        whatsappConfirmationTemplateName: "booking_confirmed",
      },
    });
    const paymentId = await createReviewablePayment(fixture, bookingId);

    await rejectPaymentReview({ businessId: fixture.business.id, actorUserId, paymentId, reason: "Сумма не совпадает" });
    await prisma.message.updateMany({ where: { bookingId }, data: { scheduledAt: new Date("2026-08-01T04:00:00.000Z") } });

    const sent: WhatsAppTemplateMessage[] = [];
    await sendDueBookingReminders(new Date("2026-08-01T04:05:00.000Z"), {
      sendTelegram: async () => {},
      sendWhatsApp: async (input) => { sent.push(input); return { externalId: "ext-rejected" }; },
      sendSms: async () => ({ externalId: "unused", deliveryStatus: "SENT" }),
    });

    expect(sent).toEqual([
      expect.objectContaining({ phoneNumberId: "phone-number-id", templateName: "booking_reminder", to: "+992900001122" }),
    ]);
  });
});

async function createConfirmedBusinessWorkspace() {
  const fixture = await createBookingFixture();
  const owner = await prisma.user.create({ data: { email: `whatsapp-owner-${randomUUID()}@example.test`, displayName: "Owner" } });
  await prisma.membership.create({ data: { businessId: fixture.business.id, userId: owner.id, role: "OWNER" } });
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
  return { fixture, bookingId: pending.bookingId, actorUserId: owner.id };
}

async function createReviewablePayment(fixture: Awaited<ReturnType<typeof createBookingFixture>>, bookingId: string) {
  const suffix = randomUUID().replace(/\D/g, "").padEnd(10, "5").slice(0, 10);
  await prisma.payment.update({
    where: { bookingId },
    data: {
      status: "NEEDS_ATTENTION",
      receiptAmountDiram: 4_000,
      recipientCardSuffix: "0000",
      attentionReason: "AMOUNT_MISMATCH",
    },
  });
  const payment = await prisma.payment.findUniqueOrThrow({ where: { bookingId } });
  await prisma.receiptSubmission.create({
    data: {
      businessId: fixture.business.id,
      paymentId: payment.id,
      storageKey: `receipts/whatsapp-trigger-${suffix}.png`,
      contentType: "image/png",
      sizeBytes: 100,
      status: "NEEDS_REVIEW",
    },
  });
  return payment.id;
}
