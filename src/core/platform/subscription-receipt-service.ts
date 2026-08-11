import { randomUUID } from "node:crypto";

import type { SubscriptionInvoice, SubscriptionReceipt } from "@/generated/prisma/client";

import { writeAuditEvent } from "@/core/audit/audit-service";
import { prisma } from "@/core/database/prisma";
import { recognizeDushanbeCityReceipt } from "@/core/payments/dushanbe-city-receipt-recognizer";
import { normalizeReceiptImage, ReceiptSubmissionError } from "@/core/payments/receipt-submission-service";
import { storeReceipt } from "@/core/payments/receipt-storage";
import { PlatformError } from "@/core/platform/platform-error";
import { platformPaymentCard } from "@/core/platform/platform-payment-card";
import { extendPeriod } from "@/core/platform/subscription-lifecycle";
import { Prisma } from "@/generated/prisma/client";

type RecognizedReceipt = Awaited<ReturnType<typeof recognizeDushanbeCityReceipt>>;

export type SubscriptionReceiptDependencies = {
  store: typeof storeReceipt;
  recognize: (image: Uint8Array) => Promise<RecognizedReceipt>;
};

const defaultDependencies: SubscriptionReceiptDependencies = { store: storeReceipt, recognize: recognizeDushanbeCityReceipt };

/**
 * Takes the transfer a business says it made for its subscription. The image goes through the same
 * gate as a customer's receipt — decoded, re-encoded, size-bounded, stored under a random key — and
 * the reading is then held against the invoice rather than against a booking.
 */
export async function submitSubscriptionReceipt(
  input: { businessId: string; bytes: Uint8Array; contentType: string },
  now = new Date(),
  dependencies: SubscriptionReceiptDependencies = defaultDependencies,
): Promise<SubscriptionReceipt> {
  const invoice = await prisma.subscriptionInvoice.findFirst({
    where: { businessId: input.businessId, status: { in: ["OPEN", "NEEDS_ATTENTION"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!invoice) throw new PlatformError("NOT_FOUND");

  let normalized: { body: Uint8Array; contentType: "image/jpeg" };
  try {
    normalized = await normalizeReceiptImage(new File([new Uint8Array(input.bytes)], "receipt", { type: input.contentType }));
  } catch (error) {
    // The caller gets one answer for "this is not a usable image", whichever layer said so.
    if (error instanceof ReceiptSubmissionError) throw new PlatformError("INVALID_INPUT");
    throw error;
  }

  const storageKey = `subscriptions/${input.businessId}/${invoice.id}/${randomUUID()}.jpg`;
  await dependencies.store({ storageKey, contentType: normalized.contentType, body: normalized.body });

  let receipt: RecognizedReceipt | null = null;
  try {
    receipt = await dependencies.recognize(normalized.body);
  } catch {
    // An unreadable photo is a question for the operator, not a refusal to the business.
    receipt = null;
  }

  const reason = receipt ? mismatchReason(receipt, invoice, now) : "OCR_UNRELIABLE";
  try {
    return await prisma.$transaction(async (transaction) => {
      const created = await transaction.subscriptionReceipt.create({
        data: {
          invoiceId: invoice.id,
          businessId: input.businessId,
          storageKey,
          contentType: normalized.contentType,
          sizeBytes: normalized.body.byteLength,
          status: reason ? "NEEDS_REVIEW" : "ACCEPTED",
          attentionReason: reason,
          parsedOperationNumber: receipt?.operationNumber,
          parsedAmountDiram: receipt?.amountDiram,
          parsedCardSuffix: receipt?.recipientCardSuffix,
          parsedOperationAt: receipt?.operationAt,
          createdAt: now,
        },
      });
      if (reason) {
        await transaction.subscriptionInvoice.update({ where: { id: invoice.id }, data: { status: "NEEDS_ATTENTION" } });
        return created;
      }
      await settleInvoice({ invoice, actorType: "receipt", actorId: undefined, now }, transaction);
      return created;
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    // The unique index on the operation number is what stops one screenshot buying two months.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new PlatformError("DUPLICATE_OPERATION");
    }
    throw error;
  }
}

/** The queue an operator works through: receipts the automatic check would not settle. */
export async function listSubscriptionReceiptsForReview(input: { actorUserId: string }) {
  await requirePlatformAdmin(input.actorUserId);
  return prisma.subscriptionReceipt.findMany({
    where: { status: "NEEDS_REVIEW" },
    orderBy: { createdAt: "asc" },
    include: {
      business: { select: { id: true, name: true, subscriptionStatus: true, subscriptionEndsAt: true } },
      invoice: { select: { id: true, reference: true, amountDiram: true, plan: true, period: true, status: true } },
    },
    take: 50,
  });
}

export async function approveSubscriptionReceipt(input: { receiptId: string; actorUserId: string; now?: Date }) {
  await requirePlatformAdmin(input.actorUserId);
  const now = input.now ?? new Date();

  await prisma.$transaction(async (transaction) => {
    const receipt = await transaction.subscriptionReceipt.findUnique({ where: { id: input.receiptId }, include: { invoice: true } });
    if (!receipt || receipt.status !== "NEEDS_REVIEW") throw new PlatformError("NOT_FOUND");
    await transaction.subscriptionReceipt.update({
      where: { id: receipt.id },
      data: { status: "ACCEPTED", reviewedById: input.actorUserId, reviewedAt: now },
    });
    await settleInvoice({ invoice: receipt.invoice, actorType: "platform_admin", actorId: input.actorUserId, now }, transaction);
  });
}

export async function rejectSubscriptionReceipt(input: { receiptId: string; actorUserId: string; reason: string }) {
  await requirePlatformAdmin(input.actorUserId);
  const reason = input.reason.trim();
  if (!reason) throw new PlatformError("INVALID_INPUT");

  await prisma.$transaction(async (transaction) => {
    const receipt = await transaction.subscriptionReceipt.findUnique({ where: { id: input.receiptId } });
    if (!receipt || receipt.status !== "NEEDS_REVIEW") throw new PlatformError("NOT_FOUND");
    await transaction.subscriptionReceipt.update({
      where: { id: receipt.id },
      data: { status: "REJECTED", reviewedById: input.actorUserId, reviewedAt: new Date(), reviewNote: reason },
    });
    // The bill goes back to being simply unpaid: the business can send another transfer against it.
    await transaction.subscriptionInvoice.update({ where: { id: receipt.invoiceId }, data: { status: "OPEN" } });
    await writeAuditEvent({
      businessId: receipt.businessId,
      type: "subscription.receipt_rejected",
      actorType: "platform_admin",
      actorId: input.actorUserId,
      metadata: { receiptId: receipt.id, invoiceId: receipt.invoiceId, reason },
    }, transaction);
  });
}

/**
 * The five things that have to agree before money is taken as paid: the receipt says the transfer
 * succeeded, for the amount billed, to the platform's card, at a moment after the invoice was cut
 * and not in the future. Returns the first disagreement, or null when all five hold.
 */
function mismatchReason(receipt: RecognizedReceipt, invoice: SubscriptionInvoice, now: Date): string | null {
  const card = platformPaymentCard();
  if (!receipt.isSuccessful) return "RECEIPT_NOT_SUCCESSFUL";
  if (receipt.amountDiram !== invoice.amountDiram) return "AMOUNT_MISMATCH";
  // With no card configured there is nothing to compare against, so no receipt is ever settled
  // automatically — it goes to the operator, who knows where the money was supposed to land.
  if (!card || receipt.recipientCardSuffix !== card.slice(-4)) return "RECIPIENT_MISMATCH";
  if (receipt.operationAt < invoice.createdAt || receipt.operationAt > now) return "OPERATION_TIME_MISMATCH";
  return null;
}

/** Marks the invoice paid and moves the subscription's own dates. */
async function settleInvoice(
  input: { invoice: SubscriptionInvoice; actorType: string; actorId?: string; now: Date },
  transaction: Prisma.TransactionClient,
) {
  const business = await transaction.business.findUniqueOrThrow({
    where: { id: input.invoice.businessId },
    select: { subscriptionEndsAt: true },
  });
  // Dates come from `extendPeriod`, never from arithmetic written here: paying early keeps the unused
  // days, and paying months late does not buy back the silent months.
  const endsAt = extendPeriod(business.subscriptionEndsAt, input.invoice.period, input.now);

  await transaction.subscriptionInvoice.update({
    where: { id: input.invoice.id },
    data: { status: "PAID", paidAt: input.now },
  });
  await transaction.business.update({
    where: { id: input.invoice.businessId },
    data: { subscriptionPlan: input.invoice.plan, subscriptionStatus: "ACTIVE", subscriptionEndsAt: endsAt },
  });
  await writeAuditEvent({
    businessId: input.invoice.businessId,
    type: "subscription.paid",
    actorType: input.actorType,
    actorId: input.actorId,
    metadata: {
      invoiceId: input.invoice.id,
      reference: input.invoice.reference,
      plan: input.invoice.plan,
      period: input.invoice.period,
      amountDiram: input.invoice.amountDiram,
      paidThrough: endsAt.toISOString(),
      // Says plainly what this is: a receipt read by us, not a confirmation from a bank.
      isBankVerified: false,
    },
  }, transaction);
}

async function requirePlatformAdmin(userId: string) {
  const actor = await prisma.user.findUnique({ where: { id: userId }, select: { isPlatformAdmin: true } });
  if (!actor?.isPlatformAdmin) throw new PlatformError("FORBIDDEN");
}
