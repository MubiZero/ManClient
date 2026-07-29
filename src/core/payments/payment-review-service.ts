import { prisma } from "@/core/database/prisma";
import { requireSettingsAccess } from "@/core/business-settings/authorize-settings";
import { writeAuditEvent } from "@/core/audit/audit-service";
import { scheduleBookingReminders } from "@/core/notifications/notification-service";

export class PaymentReviewError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "FORBIDDEN" | "NOT_FOUND" | "INVALID_STATUS") { super(code); this.name = "PaymentReviewError"; }
}

type ActorInput = { businessId: string; actorUserId: string };

const reviewInclude = { booking: { include: { customer: true, service: true, branch: true, staff: true } }, submissions: { where: { status: "NEEDS_REVIEW" as const }, orderBy: { createdAt: "desc" as const }, take: 1 } };

export async function listPaymentsForReview(input: ActorInput) {
  await prisma.$transaction((transaction) => requireSettingsAccess(transaction, input));
  return prisma.payment.findMany({ where: { businessId: input.businessId, status: "NEEDS_ATTENTION", submissions: { some: { status: "NEEDS_REVIEW" } } }, include: reviewInclude, orderBy: { updatedAt: "asc" }, take: 100 });
}

export async function getPaymentForReview(input: ActorInput & { paymentId: string }) {
  await prisma.$transaction((transaction) => requireSettingsAccess(transaction, input));
  const payment = await prisma.payment.findFirst({
    where: { id: input.paymentId, businessId: input.businessId },
    include: {
      booking: { include: { customer: true, service: true, branch: true, staff: true, auditEvents: { orderBy: { createdAt: "desc" } } } },
      submissions: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!payment) throw new PaymentReviewError("NOT_FOUND");
  return payment;
}

export async function approvePaymentReview(input: ActorInput & { paymentId: string; reason?: string }, now = new Date()) {
  const result = await prisma.$transaction(async (transaction) => {
    const actor = await requireSettingsAccess(transaction, input);
    const payment = await transaction.payment.findFirst({ where: { id: input.paymentId, businessId: input.businessId }, include: { booking: true, submissions: { where: { status: "NEEDS_REVIEW" }, orderBy: { createdAt: "desc" }, take: 1 } } });
    if (!payment) throw new PaymentReviewError("NOT_FOUND");
    if (payment.status === "RECEIPT_ACCEPTED") return { bookingId: payment.bookingId, changed: false };
    if (payment.status !== "NEEDS_ATTENTION" || payment.booking.status !== "PENDING_PAYMENT") throw new PaymentReviewError("INVALID_STATUS");
    const reason = input.reason?.trim().slice(0, 300) || "Подтверждено после ручной проверки";
    const submission = payment.submissions[0];
    if (!submission) throw new PaymentReviewError("INVALID_STATUS");
    await transaction.receiptSubmission.update({ where: { id: submission.id }, data: { status: "ACCEPTED", reviewedAt: now, reviewedBy: `membership:${actor.id}`, reviewNote: reason } });
    await transaction.payment.update({ where: { id: payment.id }, data: { status: "RECEIPT_ACCEPTED", receiptAcceptedAt: now, reviewedAt: now, reviewedBy: `membership:${actor.id}`, reviewReason: reason, isBankVerified: false } });
    await transaction.booking.update({ where: { id: payment.bookingId }, data: { status: "CONFIRMED", confirmedAt: now, confirmedBy: `membership:${actor.id}`, expiresAt: null } });
    await writeAuditEvent({ businessId: input.businessId, bookingId: payment.bookingId, type: "payment.review_approved", actorType: "membership", actorId: actor.id, metadata: { reason, attentionReason: payment.attentionReason ?? "UNKNOWN" } }, transaction);
    return { bookingId: payment.bookingId, changed: true };
  });
  if (result.changed) await scheduleBookingReminders(result.bookingId);
  return result;
}

export async function rejectPaymentReview(input: ActorInput & { paymentId: string; reason: string }, now = new Date()) {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 300) throw new PaymentReviewError("INVALID_INPUT");
  return prisma.$transaction(async (transaction) => {
    const actor = await requireSettingsAccess(transaction, input);
    const payment = await transaction.payment.findFirst({ where: { id: input.paymentId, businessId: input.businessId }, include: { submissions: { where: { status: "NEEDS_REVIEW" }, orderBy: { createdAt: "desc" }, take: 1 } } });
    if (!payment) throw new PaymentReviewError("NOT_FOUND");
    if (payment.status === "REJECTED") return { bookingId: payment.bookingId, changed: false };
    if (payment.status !== "NEEDS_ATTENTION") throw new PaymentReviewError("INVALID_STATUS");
    const submission = payment.submissions[0];
    if (!submission) throw new PaymentReviewError("INVALID_STATUS");
    await transaction.receiptSubmission.update({ where: { id: submission.id }, data: { status: "REJECTED", reviewedAt: now, reviewedBy: `membership:${actor.id}`, reviewNote: reason } });
    await transaction.payment.update({ where: { id: payment.id }, data: { status: "REJECTED", reviewedAt: now, reviewedBy: `membership:${actor.id}`, reviewReason: reason } });
    await writeAuditEvent({ businessId: input.businessId, bookingId: payment.bookingId, type: "payment.review_rejected", actorType: "membership", actorId: actor.id, metadata: { reason, attentionReason: payment.attentionReason ?? "UNKNOWN" } }, transaction);
    return { bookingId: payment.bookingId, changed: true };
  });
}
