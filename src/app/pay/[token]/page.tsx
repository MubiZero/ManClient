import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { verifyBookingActionToken } from "@/core/bookings/booking-action-token";
import { prisma } from "@/core/database/prisma";
import { getPaymentUrl } from "@/core/payments/payment-service";
import { getPublicPayment } from "@/core/payments/receipt-submission-service";
import { PaymentPage } from "@/features/public-payment/payment-page";
import { resolveLocale } from "@/i18n/translate";

const LOCALE_COOKIE = "nc-locale";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string }>;
};

export default async function PublicPaymentPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { lang } = await searchParams;
  const result = await loadPayment(token);
  if (!result) notFound();
  const cookieStore = await cookies();
  const business = await prisma.business.findUnique({
    where: { slug: result.payment.business.slug },
    select: { publicPageLocale: true },
  });
  const locale = resolveLocale([lang, cookieStore.get(LOCALE_COOKIE)?.value, business?.publicPageLocale]);
  return (
    <PaymentPage token={token} initialPayment={result.payment} paymentUrl={result.paymentUrl} locale={locale} />
  );
}

async function loadPayment(token: string) {
  try {
    const action = verifyBookingActionToken(token, new Date(), "view_payment");
    const payment = await getPublicPayment(action.paymentId);
    if (!payment) return null;
    // A booking that asked for no money has no payment link, and demanding one here would 404 the page
    // that is supposed to confirm the visit.
    const paymentUrl = payment.amountDiram > 0 ? (await getPaymentUrl(payment.id)).toString() : null;
    return { payment, paymentUrl };
  } catch {
    return null;
  }
}
