import { randomUUID } from "node:crypto";

import sharp from "sharp";

import { writeAuditEvent } from "@/core/audit/audit-service";
import { prisma } from "@/core/database/prisma";
import { recognizeDushanbeCityReceipt } from "@/core/payments/dushanbe-city-receipt-recognizer";
import { confirmFromReceipt, DuplicateOperationError } from "@/core/payments/payment-service";
import { getReceipt, storeReceipt } from "@/core/payments/receipt-storage";
import { scheduleCustomerMessage } from "@/core/notifications/notification-service";
import { scheduleBusinessNotification } from "@/core/notifications/business-notification-service";

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const MAX_RECEIPT_PIXELS = 24_000_000;
const REVIEW_WINDOW_MS = 24 * 60 * 60_000;
const SUBMISSION_COOLDOWN_MS = 15_000;
const MAX_SUBMISSIONS_PER_PAYMENT = 5;

export class ReceiptSubmissionError extends Error {
  constructor(public readonly code: "INVALID_IMAGE" | "PAYMENT_UNAVAILABLE" | "ALREADY_PAID" | "RATE_LIMITED") {
    super(code);
    this.name = "ReceiptSubmissionError";
  }
}

export async function normalizeReceiptImage(file: File): Promise<{ body: Uint8Array; contentType: "image/jpeg" }> {
  if (file.size === 0 || file.size > MAX_RECEIPT_BYTES) throw new ReceiptSubmissionError("INVALID_IMAGE");
  const input = new Uint8Array(await file.arrayBuffer());
  try {
    const image = sharp(input, { limitInputPixels: MAX_RECEIPT_PIXELS, failOn: "warning" });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || !["jpeg", "png", "webp"].includes(metadata.format ?? "")) {
      throw new Error("unsupported image");
    }
    const body = await image.rotate().jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    return { body, contentType: "image/jpeg" };
  } catch {
    throw new ReceiptSubmissionError("INVALID_IMAGE");
  }
}

export async function submitReceipt(input: { paymentId: string; file: File; channel: "web" | "telegram" }, now = new Date()) {
  return submitReceiptImage({ paymentId: input.paymentId, bytes: new Uint8Array(await input.file.arrayBuffer()), contentType: input.file.type, channel: input.channel }, now);
}

type ReceiptSubmissionDependencies = {
  store: typeof storeReceipt;
  recognize: typeof recognizeDushanbeCityReceipt;
};

const defaultDependencies: ReceiptSubmissionDependencies = { store: storeReceipt, recognize: recognizeDushanbeCityReceipt };

export async function submitReceiptImage(
  input: { paymentId: string; bytes: Uint8Array; contentType: string; channel: "web" | "telegram" },
  now = new Date(),
  dependencies: ReceiptSubmissionDependencies = defaultDependencies,
) {
  const payment = await prisma.payment.findUnique({
    where: { id: input.paymentId },
    include: { booking: true },
  });
  if (!payment || payment.booking.status !== "PENDING_PAYMENT") throw new ReceiptSubmissionError("PAYMENT_UNAVAILABLE");
  if (payment.status === "RECEIPT_ACCEPTED") throw new ReceiptSubmissionError("ALREADY_PAID");
  await assertSubmissionRateLimit(payment.id, now);

  const normalized = await normalizeReceiptImage(new File([new Uint8Array(input.bytes)], "receipt", { type: input.contentType }));
  const storageKey = `receipts/${payment.businessId}/${payment.id}/${randomUUID()}.jpg`;
  await dependencies.store({ storageKey, contentType: normalized.contentType, body: normalized.body });
  const reviewDeadline = new Date(Math.min(payment.booking.startsAt.getTime(), now.getTime() + REVIEW_WINDOW_MS));
  const submission = await prisma.$transaction(async (transaction) => {
    const created = await transaction.receiptSubmission.create({
      data: { businessId: payment.businessId, paymentId: payment.id, storageKey, contentType: normalized.contentType, sizeBytes: normalized.body.byteLength, createdAt: now },
    });
    await transaction.payment.update({ where: { id: payment.id }, data: { status: "RECEIPT_PROCESSING", reviewDeadline } });
    await writeAuditEvent({ businessId: payment.businessId, bookingId: payment.bookingId, type: "receipt.submitted", actorType: "customer", actorId: payment.booking.customerId, metadata: { submissionId: created.id, channel: input.channel } }, transaction);
    await scheduleBusinessNotification({ businessId: payment.businessId, bookingId: payment.bookingId, kind: "RECEIPT_PROCESSING", deduplicationKey: `receipt:${created.id}:processing`, scheduledAt: now }, transaction);
    return created;
  });

  return processReceiptSubmission(submission.id, normalized.body, now, dependencies.recognize);
}

async function assertSubmissionRateLimit(paymentId: string, now: Date) {
  const [totalSubmissions, latestSubmission] = await Promise.all([
    prisma.receiptSubmission.count({ where: { paymentId } }),
    prisma.receiptSubmission.findFirst({ where: { paymentId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  if (totalSubmissions >= MAX_SUBMISSIONS_PER_PAYMENT) throw new ReceiptSubmissionError("RATE_LIMITED");
  if (latestSubmission && now.getTime() - latestSubmission.createdAt.getTime() < SUBMISSION_COOLDOWN_MS) {
    throw new ReceiptSubmissionError("RATE_LIMITED");
  }
}

export async function processReceiptSubmission(submissionId: string, image: Uint8Array, now = new Date(), recognize = recognizeDushanbeCityReceipt) {
  const claimed = await prisma.receiptSubmission.updateMany({
    where: { id: submissionId, status: { in: ["UPLOADED", "FAILED"] } },
    data: { status: "PROCESSING", attempts: { increment: 1 }, failureCode: null },
  });
  if (claimed.count !== 1) return prisma.receiptSubmission.findUniqueOrThrow({ where: { id: submissionId } });
  const submission = await prisma.receiptSubmission.findUniqueOrThrow({ where: { id: submissionId }, include: { payment: true } });

  let receipt: Awaited<ReturnType<typeof recognizeDushanbeCityReceipt>>;
  try {
    receipt = await recognize(image);
  } catch {
    return markNeedsReview(submission, "OCR_UNRELIABLE", now);
  }

  try {
    const result = await confirmFromReceipt({ ...receipt, paymentId: submission.paymentId, receiptStorageKey: submission.storageKey });
    const status = result.status === "RECEIPT_ACCEPTED" ? "ACCEPTED" : "NEEDS_REVIEW";
    return prisma.receiptSubmission.update({
      where: { id: submission.id },
      data: { status, parsedOperationNumber: receipt.operationNumber, parsedAmountDiram: receipt.amountDiram, parsedCardSuffix: receipt.recipientCardSuffix, parsedOperationAt: receipt.operationAt, processedAt: now },
    });
  } catch (error) {
    if (error instanceof DuplicateOperationError) return markNeedsReview(submission, "DUPLICATE_OPERATION", now);
    await prisma.receiptSubmission.update({ where: { id: submission.id }, data: { status: "FAILED", failureCode: "PROCESSING_FAILED", processedAt: now } });
    throw error;
  }
}

export async function retryReceiptSubmissions(limit = 10) {
  const pending = await prisma.receiptSubmission.findMany({ where: { status: { in: ["UPLOADED", "FAILED"] }, attempts: { lt: 3 } }, orderBy: { createdAt: "asc" }, take: Math.max(1, Math.min(limit, 50)) });
  let processed = 0;
  for (const submission of pending) {
    try {
      const receipt = await getReceipt(submission.storageKey);
      await processReceiptSubmission(submission.id, receipt.body);
      processed += 1;
    } catch {
      // Persisted FAILED state is retried by the next scheduled run.
    }
  }
  return processed;
}

async function markNeedsReview(
  submission: Awaited<ReturnType<typeof prisma.receiptSubmission.findUniqueOrThrow>> & { payment: { bookingId: string } },
  reason: string,
  now: Date,
) {
  await prisma.$transaction(async (transaction) => {
    await transaction.receiptSubmission.update({ where: { id: submission.id }, data: { status: "NEEDS_REVIEW", failureCode: reason, processedAt: now } });
    await transaction.payment.update({ where: { id: submission.paymentId }, data: { status: "NEEDS_ATTENTION", attentionReason: reason, receiptStorageKey: submission.storageKey } });
    await writeAuditEvent({ businessId: submission.businessId, bookingId: submission.payment.bookingId, type: "receipt.needs_review", actorType: "system", metadata: { submissionId: submission.id, reason } }, transaction);
    await scheduleBusinessNotification({ businessId: submission.businessId, bookingId: submission.payment.bookingId, kind: "RECEIPT_NEEDS_REVIEW", deduplicationKey: `receipt:${submission.id}:needs-review`, scheduledAt: now }, transaction);
    await scheduleCustomerMessage({ bookingId: submission.payment.bookingId, kind: "RECEIPT_NEEDS_REVIEW", scheduledAt: now }, transaction);
  });
  return prisma.receiptSubmission.findUniqueOrThrow({ where: { id: submission.id } });
}

export async function getPublicPayment(paymentId: string) {
  return prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true, amountDiram: true, totalDiram: true, status: true, reviewDeadline: true,
      booking: {
        select: {
          status: true, expiresAt: true, startsAt: true,
          customer: { select: { name: true } },
          service: { select: { name: true } },
          staff: { select: { displayName: true } },
          branch: { select: { name: true, timeZone: true } },
          promoRedemption: { select: { discountAppliedDiram: true, promoCode: { select: { code: true } } } },
        },
      },
      business: { select: { name: true, slug: true, logoStorageKey: true, brandColor: true } },
      submissions: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, createdAt: true } },
    },
  });
}
