import { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/core/database/prisma";
import { decryptCardNumber } from "@/core/payments/card-encryption";
import { receiptInputSchema, type ReceiptInput } from "@/core/payments/receipt-recognizer";
import { createPaymentUrl } from "@/integrations/dushanbe-city/payment-link";

export class DuplicateOperationError extends Error {
  readonly code = "DUPLICATE_OPERATION";

  constructor() {
    super("DUPLICATE_OPERATION");
    this.name = "DuplicateOperationError";
  }
}

export async function getPaymentUrl(paymentId: string): Promise<URL> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { booking: { include: { branch: true } } },
  });
  const encryptedCardNumber = payment?.booking.branch.recipientCardEncrypted;
  const encryptionKey = process.env.CARD_ENCRYPTION_KEY;
  if (!payment || !encryptedCardNumber || !encryptionKey) {
    throw new Error("Business payment card is not configured");
  }

  return createPaymentUrl({
    cardNumber: decryptCardNumber(encryptedCardNumber, encryptionKey),
    amountDiram: payment.amountDiram,
    bookingReference: `MC-${payment.bookingId}`,
  });
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
        receipt.recipientCardSuffix === payment.booking.branch.recipientCardLast4;
      if (!isMatching || payment.booking.status !== "PENDING_PAYMENT") {
        return transaction.payment.update({
          where: { id: payment.id },
          data: {
            status: "NEEDS_ATTENTION",
            operationNumber: receipt.operationNumber,
            receiptAmountDiram: receipt.amountDiram,
            recipientCardSuffix: receipt.recipientCardSuffix,
            operationAt: receipt.operationAt,
            receiptStorageKey: receipt.receiptStorageKey,
          },
        });
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
        },
      });
      await transaction.booking.update({
        where: { id: payment.bookingId },
        data: { status: "CONFIRMED" },
      });

      return confirmedPayment;
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DuplicateOperationError();
    }

    throw error;
  }
}
