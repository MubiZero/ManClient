import { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/core/database/prisma";
import { writeAuditEvent } from "@/core/audit/audit-service";
import { scheduleConfirmationEffects } from "@/core/bookings/confirm-booking-effects";
import { decryptCardNumber } from "@/core/payments/card-encryption";
import { receiptInputSchema, type ReceiptInput } from "@/core/payments/receipt-recognizer";
import { createPaymentUrl } from "@/integrations/dushanbe-city/payment-link";
import { scheduleCustomerMessage } from "@/core/notifications/notification-service";
import { scheduleBusinessNotification } from "@/core/notifications/business-notification-service";

export class DuplicateOperationError extends Error {
  readonly code = "DUPLICATE_OPERATION";

  constructor() {
    super("DUPLICATE_OPERATION");
    this.name = "DuplicateOperationError";
  }
}

export class PaymentConfigurationError extends Error {
  readonly code = "PAYMENT_NOT_CONFIGURED";

  constructor() {
    super("PAYMENT_NOT_CONFIGURED");
    this.name = "PaymentConfigurationError";
  }
}

export async function assertPaymentCardConfigured(branchId: string): Promise<void> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { recipientCardEncrypted: true, recipientCardLast4: true },
  });
  const encryptionKey = process.env.CARD_ENCRYPTION_KEY;
  if (!branch?.recipientCardEncrypted || !branch.recipientCardLast4 || !encryptionKey) {
    throw new PaymentConfigurationError();
  }

  decryptCardNumber(branch.recipientCardEncrypted, encryptionKey);
}

export type PaymentInstructions = {
  /** Shortcut for customers whose bank opens it; useless for everyone else, hence the fields below. */
  url: string;
  /** The salon's card, in full. A transfer cannot be made from four last digits. */
  cardNumber: string;
  /** What the customer writes on the transfer so the receipt can be matched to this booking. */
  reference: string;
  amountDiram: number;
};

/**
 * Everything a customer needs to pay by hand. The page used to show only the ExpressPay link, so a
 * customer banking with anyone else had nowhere to send the money — and was then asked for a receipt
 * of a payment the page had made impossible.
 */
export async function getPaymentInstructions(paymentId: string): Promise<PaymentInstructions> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { booking: { include: { branch: true } } },
  });
  const encryptedCardNumber = payment?.booking.branch.recipientCardEncrypted;
  const encryptionKey = process.env.CARD_ENCRYPTION_KEY;
  if (!payment || !encryptedCardNumber || !encryptionKey) {
    throw new PaymentConfigurationError();
  }

  const cardNumber = decryptCardNumber(encryptedCardNumber, encryptionKey);
  const reference = `MC-${payment.bookingId}`;
  return {
    url: createPaymentUrl({ cardNumber, amountDiram: payment.amountDiram, bookingReference: reference }).toString(),
    cardNumber,
    reference,
    amountDiram: payment.amountDiram,
  };
}

export async function getPaymentUrl(paymentId: string): Promise<URL> {
  return new URL((await getPaymentInstructions(paymentId)).url);
}

export async function confirmFromReceipt(input: ReceiptInput) {
  const receipt = receiptInputSchema.parse(input);

  try {
    return await prisma.$transaction(async (transaction) => {
      const payment = await transaction.payment.findUnique({
        where: { id: receipt.paymentId },
        include: { booking: { include: { branch: true } } },
      });
      if (!payment) {
        throw new Error("Payment does not exist");
      }

      if (
        payment.status === "RECEIPT_ACCEPTED" &&
        payment.operationNumber === receipt.operationNumber
      ) {
        return payment;
      }

      const isMatching =
        receipt.isSuccessful &&
        receipt.amountDiram === payment.amountDiram &&
        receipt.recipientCardSuffix === payment.booking.branch.recipientCardLast4 &&
        receipt.operationAt >= payment.booking.createdAt &&
        payment.booking.expiresAt !== null &&
        receipt.operationAt <= payment.booking.expiresAt;
      if (!isMatching || payment.booking.status !== "PENDING_PAYMENT") {
        const attentionReason = payment.booking.status !== "PENDING_PAYMENT" ? "BOOKING_NOT_PENDING"
          : !receipt.isSuccessful ? "RECEIPT_NOT_SUCCESSFUL"
          : receipt.amountDiram !== payment.amountDiram ? "AMOUNT_MISMATCH"
          : receipt.recipientCardSuffix !== payment.booking.branch.recipientCardLast4 ? "RECIPIENT_MISMATCH"
          : receipt.operationAt < payment.booking.createdAt || payment.booking.expiresAt === null || receipt.operationAt > payment.booking.expiresAt ? "OPERATION_TIME_MISMATCH"
          : "RECEIPT_MISMATCH";
        const needsAttention = await transaction.payment.update({
          where: { id: payment.id },
          data: {
            status: "NEEDS_ATTENTION",
            operationNumber: receipt.operationNumber,
            receiptAmountDiram: receipt.amountDiram,
            recipientCardSuffix: receipt.recipientCardSuffix,
            operationAt: receipt.operationAt,
            receiptStorageKey: receipt.receiptStorageKey,
            attentionReason,
          },
        });
        await scheduleBusinessNotification({ businessId: payment.businessId, bookingId: payment.bookingId, kind: "RECEIPT_NEEDS_REVIEW", deduplicationKey: `payment:${payment.id}:needs-review:${receipt.operationNumber}`, scheduledAt: new Date() }, transaction);
        await scheduleCustomerMessage({ bookingId: payment.bookingId, kind: "RECEIPT_NEEDS_REVIEW" }, transaction);
        return needsAttention;
      }

      const confirmedPayment = await transaction.payment.update({
        where: { id: payment.id },
        data: {
          status: "RECEIPT_ACCEPTED",
          operationNumber: receipt.operationNumber,
          receiptAmountDiram: receipt.amountDiram,
          recipientCardSuffix: receipt.recipientCardSuffix,
          operationAt: receipt.operationAt,
          receiptStorageKey: receipt.receiptStorageKey,
          receiptAcceptedAt: new Date(),
          isBankVerified: false,
          attentionReason: null,
        },
      });
      await transaction.booking.update({
        where: { id: payment.bookingId },
        data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedBy: "receipt", expiresAt: null },
      });
      await writeAuditEvent({
        businessId: payment.businessId,
        bookingId: payment.bookingId,
        type: "booking.confirmed",
        actorType: "receipt",
        metadata: {
          operationNumber: receipt.operationNumber,
          recipientCardSuffix: receipt.recipientCardSuffix,
          amountDiram: receipt.amountDiram,
          isBankVerified: false,
        },
      }, transaction);
      await scheduleConfirmationEffects({
        businessId: payment.businessId,
        bookingId: payment.bookingId,
        startsAt: payment.booking.startsAt,
        notificationKind: "PAYMENT_APPROVED",
        deduplicationKey: `payment:${payment.id}:approved`,
      }, transaction);

      return confirmedPayment;
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DuplicateOperationError();
    }

    throw error;
  }
}
