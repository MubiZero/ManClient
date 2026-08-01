import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import {
  approvePaymentAsPlatformAdmin,
  PaymentReviewError,
  rejectPaymentAsPlatformAdmin,
} from "@/core/payments/payment-review-service";
import { listAttentionPaymentsAcrossBusinesses } from "@/core/platform/platform-payments";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("platform admin payment actions", () => {
  const businessIds: string[] = [];

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
  });

  it("lists NEEDS_ATTENTION payments across businesses without requiring a business membership", async () => {
    const first = await createAttentionPayment();
    const second = await createAttentionPayment();

    const { items, nextCursor } = await listAttentionPaymentsAcrossBusinesses();

    expect(items.map((item) => item.id)).toEqual(expect.arrayContaining([first.paymentId, second.paymentId]));
    expect(nextCursor).toBeNull();
  });

  it("approves a payment as a platform admin, confirms the booking and stamps the actor", async () => {
    const attention = await createAttentionPayment();
    const adminUserId = randomUUID();

    const result = await approvePaymentAsPlatformAdmin({ paymentId: attention.paymentId, actorUserId: adminUserId, reason: "Проверено вручную" });
    expect(result).toEqual({ bookingId: attention.bookingId, changed: true });

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: attention.paymentId } });
    expect(payment.status).toBe("RECEIPT_ACCEPTED");
    expect(payment.reviewedBy).toBe(`platform_admin:${adminUserId}`);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: attention.bookingId } });
    expect(booking.status).toBe("CONFIRMED");

    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { bookingId: attention.bookingId, type: "payment.review_approved" } });
    expect(audit.actorType).toBe("platform_admin");
    expect(audit.actorId).toBe(adminUserId);
  });

  it("is idempotent when approving an already-accepted payment", async () => {
    const attention = await createAttentionPayment();
    const adminUserId = randomUUID();

    await approvePaymentAsPlatformAdmin({ paymentId: attention.paymentId, actorUserId: adminUserId });
    await expect(
      approvePaymentAsPlatformAdmin({ paymentId: attention.paymentId, actorUserId: adminUserId }),
    ).resolves.toEqual({ bookingId: attention.bookingId, changed: false });
  });

  it("rejects a payment as a platform admin with a reason and leaves the booking pending", async () => {
    const attention = await createAttentionPayment();
    const adminUserId = randomUUID();

    const result = await rejectPaymentAsPlatformAdmin({ paymentId: attention.paymentId, actorUserId: adminUserId, reason: "Чек не читается" });
    expect(result).toEqual({ bookingId: attention.bookingId, changed: true });

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: attention.paymentId } });
    expect(payment.status).toBe("REJECTED");

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: attention.bookingId } });
    expect(booking.status).toBe("PENDING_PAYMENT");
  });

  it("rejects a too-short rejection reason", async () => {
    const attention = await createAttentionPayment();

    await expect(
      rejectPaymentAsPlatformAdmin({ paymentId: attention.paymentId, actorUserId: randomUUID(), reason: "no" }),
    ).rejects.toEqual(new PaymentReviewError("INVALID_INPUT"));
  });

  it("returns NOT_FOUND for an unknown payment id", async () => {
    await expect(
      approvePaymentAsPlatformAdmin({ paymentId: "missing-payment", actorUserId: randomUUID() }),
    ).rejects.toEqual(new PaymentReviewError("NOT_FOUND"));
  });

  async function createAttentionPayment() {
    const fixture = await createBookingFixture();
    businessIds.push(fixture.business.id);
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
        storageKey: `receipts/platform-test-${randomUUID()}.jpg`,
        contentType: "image/jpeg",
        sizeBytes: 1024,
        status: "NEEDS_REVIEW",
      },
    });

    return { paymentId: booking.paymentId, bookingId: booking.bookingId };
  }
});
