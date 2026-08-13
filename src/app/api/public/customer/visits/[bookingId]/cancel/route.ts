import { BookingPolicyError } from "@/core/bookings/booking-policy";
import { readCustomerPhone } from "@/core/customers/customer-session";
import { cancelVisitForPhone, CustomerVisitError } from "@/core/customers/customer-visits";

type RouteContext = { params: Promise<{ bookingId: string }> };

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  const phone = await readCustomerPhone();
  if (!phone) return Response.json({ error: "SIGNED_OUT" }, { status: 401 });

  const { bookingId } = await context.params;
  try {
    await cancelVisitForPhone({ phone, bookingId });
    return Response.json({ ok: true });
  } catch (error) {
    // A booking belonging to another number is reported as missing rather than as forbidden: the
    // difference between the two answers is itself a way to ask whether a booking id exists.
    if (error instanceof CustomerVisitError) return Response.json({ error: error.code }, { status: 404 });
    if (error instanceof BookingPolicyError) return Response.json({ error: error.code, limit: error.limit }, { status: 409 });
    throw error;
  }
}
