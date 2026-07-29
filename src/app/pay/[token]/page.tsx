import { notFound } from "next/navigation";

import { verifyBookingActionToken } from "@/core/bookings/booking-action-token";
import { getPaymentUrl } from "@/core/payments/payment-service";
import { getPublicPayment } from "@/core/payments/receipt-submission-service";
import { PaymentPage } from "@/features/public-payment/payment-page";

type PageProps = { params: Promise<{ token: string }> };

export default async function PublicPaymentPage({ params }: PageProps) {
  const { token } = await params;
  const result = await loadPayment(token);
  if (!result) notFound();
  return <PaymentPage token={token} initialPayment={result.payment} paymentUrl={result.paymentUrl} />;
}

async function loadPayment(token: string) {
  try {
    const action = verifyBookingActionToken(token, new Date(), "view_payment");
    const payment = await getPublicPayment(action.paymentId);
    if (!payment) return null;
    const paymentUrl = await getPaymentUrl(payment.id);
    return { payment, paymentUrl: paymentUrl.toString() };
  } catch {
    return null;
  }
}
