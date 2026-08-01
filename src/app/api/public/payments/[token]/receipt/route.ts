import { verifyBookingActionToken } from "@/core/bookings/booking-action-token";
import { ReceiptSubmissionError, submitReceipt } from "@/core/payments/receipt-submission-service";

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  let paymentId: string;
  try {
    const action = verifyBookingActionToken(token, new Date(), "view_payment");
    paymentId = action.paymentId;
  } catch {
    return Response.json({ error: "INVALID_OR_EXPIRED_LINK" }, { status: 403 });
  }

  try {
    const data = await request.formData();
    const file = data.get("receipt");
    if (!(file instanceof File)) return Response.json({ error: "INVALID_IMAGE" }, { status: 400 });
    const submission = await submitReceipt({ paymentId, file, channel: "web" });
    return Response.json({ status: submission.status }, { status: 201 });
  } catch (error) {
    if (error instanceof ReceiptSubmissionError) {
      const status = error.code === "PAYMENT_UNAVAILABLE" || error.code === "ALREADY_PAID" ? 409 : error.code === "RATE_LIMITED" ? 429 : 400;
      return Response.json({ error: error.code }, { status });
    }
    return Response.json({ error: "PROCESSING_FAILED" }, { status: 500 });
  }
}
