import type { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/core/database/prisma";
import { requireSettingsAccess } from "@/core/business-settings/authorize-settings";
import { SettingsError } from "@/core/business-settings/settings-error";
import { writeAuditEvent } from "@/core/audit/audit-service";
import { scheduleBookingReminders, scheduleWhatsAppConfirmation } from "@/core/notifications/notification-service";
import { getReceipt, type ReceiptObject } from "@/core/payments/receipt-storage";

export class PaymentReviewError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "FORBIDDEN" | "NOT_FOUND" | "INVALID_STATUS") { super(code); this.name = "PaymentReviewError"; }
}

type ActorInput = { businessId: string; actorUserId: string };

const bookingReviewSelect = {
  id: true,
  startsAt: true,
  status: true,
  customer: { select: { id: true, name: true, phone: true, telegramChatId: true } },
  service: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true, timeZone: true, recipientCardLast4: true } },
  staff: { select: { id: true, displayName: true } },
} as const;

const reviewSubmissionOrder: Prisma.ReceiptSubmissionOrderByWithRelationInput[] = [
  { createdAt: "desc" },
  { id: "desc" },
];

const reviewSelect = {
  id: true,
  amountDiram: true,
  status: true,
  receiptAmountDiram: true,
  recipientCardSuffix: true,
  operationAt: true,
  attentionReason: true,
  reviewReason: true,
  reviewedAt: true,
  updatedAt: true,
  booking: { select: bookingReviewSelect },
  submissions: {
    where: { status: "NEEDS_REVIEW" as const },
    orderBy: reviewSubmissionOrder,
    take: 1,
    select: { id: true, status: true, contentType: true, sizeBytes: true, createdAt: true },
  },
} as const;

export async function listPaymentsForReview(
  input: ActorInput,
  page: { cursor?: string | null; limit?: number } = {},
) {
  await prisma.$transaction((transaction) => requireReviewAccess(transaction, input));
  const limit = Math.min(Math.max(page.limit ?? 100, 1), 100);
  const rows = await prisma.payment.findMany({
    where: { businessId: input.businessId, status: "NEEDS_ATTENTION", submissions: { some: { status: "NEEDS_REVIEW" } } },
    select: reviewSelect,
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: limit,
    ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
  });
  return rows.map(safeReviewPayment);
}

export async function getPaymentForReview(input: ActorInput & { paymentId: string }) {
  await prisma.$transaction((transaction) => requireReviewAccess(transaction, input));
  const payment = await prisma.payment.findFirst({
    where: { id: input.paymentId, businessId: input.businessId },
    select: reviewSelect,
  });
  if (!payment) throw new PaymentReviewError("NOT_FOUND");
  return safeReviewPayment(payment);
}

export async function getPaymentReceiptForReview(
  input: ActorInput & { paymentId: string; submissionId?: string },
): Promise<ReceiptObject> {
  const submission = await prisma.$transaction(async (transaction) => {
    await requireReviewAccess(transaction, input);
    const row = await transaction.receiptSubmission.findFirst({
      where: { paymentId: input.paymentId, businessId: input.businessId, status: "NEEDS_REVIEW" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, storageKey: true },
    });
    if (!row) throw new PaymentReviewError("NOT_FOUND");
    if (input.submissionId && row.id !== input.submissionId) {
      throw new PaymentReviewError("INVALID_STATUS");
    }
    return row;
  });
  return getReceipt(submission.storageKey);
}

export async function approvePaymentReview(input: ActorInput & { paymentId: string; submissionId?: string; reason?: string }, now = new Date()) {
  const result = await prisma.$transaction(async (transaction) => {
    const actor = await requireReviewAccess(transaction, input);
    const payment = await transaction.payment.findFirst({ where: { id: input.paymentId, businessId: input.businessId }, include: { booking: true, submissions: { where: { status: "NEEDS_REVIEW" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 } } });
    if (!payment) throw new PaymentReviewError("NOT_FOUND");
    if (payment.status === "RECEIPT_ACCEPTED") return { bookingId: payment.bookingId, changed: false };
    if (payment.status !== "NEEDS_ATTENTION" || payment.booking.status !== "PENDING_PAYMENT") throw new PaymentReviewError("INVALID_STATUS");
    const reason = input.reason?.trim().slice(0, 300) || "Подтверждено после ручной проверки";
    const submission = payment.submissions[0];
    if (!submission) throw new PaymentReviewError("INVALID_STATUS");
    if (input.submissionId && submission.id !== input.submissionId) throw new PaymentReviewError("INVALID_STATUS");
    const claimed = await transaction.payment.updateMany({
      where: { id: payment.id, businessId: input.businessId, status: "NEEDS_ATTENTION" },
      data: { status: "RECEIPT_ACCEPTED", receiptAcceptedAt: now, reviewedAt: now, reviewedBy: `membership:${actor.id}`, reviewReason: reason, isBankVerified: false },
    });
    if (claimed.count !== 1) {
      const current = await transaction.payment.findUnique({ where: { id: payment.id }, select: { status: true } });
      if (current?.status === "RECEIPT_ACCEPTED") return { bookingId: payment.bookingId, changed: false };
      throw new PaymentReviewError("INVALID_STATUS");
    }
    await transaction.receiptSubmission.update({ where: { id: submission.id }, data: { status: "ACCEPTED", reviewedAt: now, reviewedBy: `membership:${actor.id}`, reviewNote: reason } });
    await transaction.booking.update({ where: { id: payment.bookingId }, data: { status: "CONFIRMED", confirmedAt: now, confirmedBy: `membership:${actor.id}`, expiresAt: null } });
    await writeAuditEvent({ businessId: input.businessId, bookingId: payment.bookingId, type: "payment.review_approved", actorType: "membership", actorId: actor.id, metadata: { reason, attentionReason: payment.attentionReason ?? "UNKNOWN" } }, transaction);
    await scheduleBookingReminders(payment.bookingId, transaction);
    await scheduleWhatsAppConfirmation(payment.bookingId, transaction);
    return { bookingId: payment.bookingId, changed: true };
  });
  return result;
}

export async function rejectPaymentReview(input: ActorInput & { paymentId: string; submissionId?: string; reason: string }, now = new Date()) {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 300) throw new PaymentReviewError("INVALID_INPUT");
  return prisma.$transaction(async (transaction) => {
    const actor = await requireReviewAccess(transaction, input);
    const payment = await transaction.payment.findFirst({ where: { id: input.paymentId, businessId: input.businessId }, include: { booking: true, submissions: { where: { status: "NEEDS_REVIEW" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 } } });
    if (!payment) throw new PaymentReviewError("NOT_FOUND");
    if (payment.status === "REJECTED") return { bookingId: payment.bookingId, changed: false };
    if (payment.status !== "NEEDS_ATTENTION" || payment.booking.status !== "PENDING_PAYMENT") throw new PaymentReviewError("INVALID_STATUS");
    const submission = payment.submissions[0];
    if (!submission) throw new PaymentReviewError("INVALID_STATUS");
    if (input.submissionId && submission.id !== input.submissionId) throw new PaymentReviewError("INVALID_STATUS");
    const claimed = await transaction.payment.updateMany({
      where: { id: payment.id, businessId: input.businessId, status: "NEEDS_ATTENTION" },
      data: { status: "REJECTED", reviewedAt: now, reviewedBy: `membership:${actor.id}`, reviewReason: reason },
    });
    if (claimed.count !== 1) {
      const current = await transaction.payment.findUnique({ where: { id: payment.id }, select: { status: true } });
      if (current?.status === "REJECTED") return { bookingId: payment.bookingId, changed: false };
      throw new PaymentReviewError("INVALID_STATUS");
    }
    await transaction.receiptSubmission.update({ where: { id: submission.id }, data: { status: "REJECTED", reviewedAt: now, reviewedBy: `membership:${actor.id}`, reviewNote: reason } });
    await writeAuditEvent({ businessId: input.businessId, bookingId: payment.bookingId, type: "payment.review_rejected", actorType: "membership", actorId: actor.id, metadata: { reason, attentionReason: payment.attentionReason ?? "UNKNOWN" } }, transaction);
    return { bookingId: payment.bookingId, changed: true };
  });
}

function safeReviewPayment<T extends {
  recipientCardSuffix: string | null;
  booking: { branch: { recipientCardLast4: string | null } };
}>(payment: T) {
  return {
    ...payment,
    recipientCardSuffix: payment.recipientCardSuffix?.slice(-4) ?? null,
    booking: {
      ...payment.booking,
      branch: {
        ...payment.booking.branch,
        recipientCardLast4: payment.booking.branch.recipientCardLast4?.slice(-4) ?? null,
      },
    },
  };
}

async function requireReviewAccess(
  transaction: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  input: ActorInput,
) {
  try {
    return await requireSettingsAccess(transaction, input);
  } catch (error) {
    if (error instanceof SettingsError && error.code === "FORBIDDEN") {
      throw new PaymentReviewError("FORBIDDEN");
    }
    throw error;
  }
}
