import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import { approvePaymentAsPlatformAdmin } from "@/core/payments/payment-review-service";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("commission entry creation on payment approval", () => {
  const businessIds: string[] = [];

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
  });

  it("creates a commission entry with the correct amount when the business is on PREMIUM with a staff commission percent", async () => {
    const attention = await createAttentionPayment({ plan: "PREMIUM", commissionPercent: 20 });

    await approvePaymentAsPlatformAdmin({ paymentId: attention.paymentId, actorUserId: randomUUID() });

    const entry = await prisma.commissionEntry.findUniqueOrThrow({ where: { bookingId: attention.bookingId } });
    expect(entry).toMatchObject({
      businessId: attention.businessId,
      staffId: attention.staffId,
      percent: 20,
      amountDiram: Math.round((5_000 * 20) / 100),
    });
  });

  it("does not create a commission entry when the business plan does not include STAFF_COMMISSIONS", async () => {
    const attention = await createAttentionPayment({ plan: "STANDARD", commissionPercent: 20 });

    await approvePaymentAsPlatformAdmin({ paymentId: attention.paymentId, actorUserId: randomUUID() });

    const entry = await prisma.commissionEntry.findUnique({ where: { bookingId: attention.bookingId } });
    expect(entry).toBeNull();
  });

  it("does not create a second commission entry on a retried/duplicate approval", async () => {
    const attention = await createAttentionPayment({ plan: "PREMIUM", commissionPercent: 20 });
    const adminUserId = randomUUID();

    await approvePaymentAsPlatformAdmin({ paymentId: attention.paymentId, actorUserId: adminUserId });
    await approvePaymentAsPlatformAdmin({ paymentId: attention.paymentId, actorUserId: adminUserId });

    const entries = await prisma.commissionEntry.findMany({ where: { bookingId: attention.bookingId } });
    expect(entries).toHaveLength(1);
  });

  async function createAttentionPayment(options: { plan: "START" | "STANDARD" | "PREMIUM"; commissionPercent?: number }) {
    const fixture = await createBookingFixture();
    businessIds.push(fixture.business.id);
    await prisma.business.update({ where: { id: fixture.business.id }, data: { subscriptionPlan: options.plan } });
    if (options.commissionPercent !== undefined) {
      await prisma.staffMember.update({ where: { id: fixture.staff.id }, data: { commissionPercent: options.commissionPercent } });
    }

    const suffix = randomUUID().replace(/\D/g, "").padEnd(9, "1").slice(0, 9);
    const booking = await createPendingBooking(
      {
        businessSlug: fixture.business.slug,
        branchId: fixture.branch.id,
        serviceId: fixture.service.id,
        staffId: fixture.staff.id,
        resourceIds: [],
        startsAt: new Date("2026-08-02T05:00:00.000Z"),
        customer: { name: "Клиент", phone: `+992${suffix}` },
      },
      new Date("2026-08-01T04:00:00.000Z"),
    );

    await prisma.payment.update({
      where: { id: booking.paymentId },
      data: { status: "NEEDS_ATTENTION", attentionReason: "AMOUNT_MISMATCH" },
    });
    await prisma.receiptSubmission.create({
      data: {
        businessId: fixture.business.id,
        paymentId: booking.paymentId,
        storageKey: `receipts/commission-test-${randomUUID()}.jpg`,
        contentType: "image/jpeg",
        sizeBytes: 1024,
        status: "NEEDS_REVIEW",
      },
    });

    return { paymentId: booking.paymentId, bookingId: booking.bookingId, businessId: fixture.business.id, staffId: fixture.staff.id };
  }
});
