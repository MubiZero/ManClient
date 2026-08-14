import { verifyBookingActionToken } from "@/core/bookings/booking-action-token";
import { extendPaymentHold } from "@/core/bookings/hold-extension";
import { getPublicPaymentView } from "@/core/payments/public-payment-view";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const action = verifyBookingActionToken(token, new Date(), "view_payment");
    const payment = await getPublicPaymentView(action.paymentId);
    if (!payment) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    return Response.json(payment, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "INVALID_OR_EXPIRED_LINK" }, { status: 403 });
  }
}

/**
 * The customer is back on the page — extend the hold and answer with the payment as it now stands.
 * A POST rather than a side effect of the GET: reading a status must not change anything, and a
 * crawler following the link should not be able to hold somebody's chair.
 */
export async function POST(_: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const action = verifyBookingActionToken(token, new Date(), "view_payment");
    await extendPaymentHold(action.paymentId);
    const payment = await getPublicPaymentView(action.paymentId);
    if (!payment) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    return Response.json(payment, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "INVALID_OR_EXPIRED_LINK" }, { status: 403 });
  }
}
