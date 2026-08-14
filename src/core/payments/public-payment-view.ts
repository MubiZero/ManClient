import { prisma } from "@/core/database/prisma";
import { getPublicPayment } from "@/core/payments/receipt-submission-service";

/**
 * What the customer's payment page is allowed to see.
 *
 * `getPublicPayment` already narrows the record to fields that may leave the cabinet; the only thing
 * missing was the rejection reason, and that one is deliberate rather than an oversight. A review
 * reason is written on every decision — an approval stores an internal note like "подтверждено после
 * ручной проверки" — so the field is read only while the payment stands rejected, which is the single
 * case where the text was written for the customer and is the difference between re-uploading the
 * same receipt forever and fixing what the business asked for.
 */
export async function getPublicPaymentView(paymentId: string) {
  const payment = await getPublicPayment(paymentId);
  if (!payment) return null;
  if (payment.status !== "REJECTED") return payment;
  const review = await prisma.payment.findUnique({ where: { id: paymentId }, select: { reviewReason: true } });
  return { ...payment, reviewReason: review?.reviewReason ?? null };
}
