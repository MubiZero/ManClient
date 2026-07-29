import { verifyBookingActionToken } from "@/core/bookings/booking-action-token";
import { getPublicPayment } from "@/core/payments/receipt-submission-service";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const action = verifyBookingActionToken(token, new Date(), "view_payment");
    const payment = await getPublicPayment(action.paymentId);
    if (!payment) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    return Response.json(payment, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "INVALID_OR_EXPIRED_LINK" }, { status: 403 });
  }
}
