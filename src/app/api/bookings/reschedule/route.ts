import { ZodError, z } from "zod";

import { BookingConflictError } from "@/core/bookings/booking-allocation";
import { BookingPolicyError } from "@/core/bookings/booking-policy";
import { rescheduleBooking } from "@/core/bookings/reschedule-booking";
import { verifyCustomerBookingToken } from "@/core/bookings/booking-action-token";
import { prisma } from "@/core/database/prisma";

const inputSchema = z.object({ token: z.string().min(1), startsAt: z.coerce.date() });

export async function POST(request: Request): Promise<Response> {
  try {
    const input = inputSchema.parse(await request.json());
    const action = verifyCustomerBookingToken(input.token, "reschedule_booking");
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: action.bookingId }, select: { customerId: true } });
    const updated = await rescheduleBooking({ bookingId: action.bookingId, customerId: booking.customerId, startsAt: input.startsAt });
    return Response.json({ bookingId: updated.id, startsAt: updated.startsAt.toISOString() });
  } catch (error) {
    if (error instanceof BookingConflictError) return Response.json({ error: error.code }, { status: 409 });
    // 422 rather than 409: the slot is fine, the request is — the business no longer lets the customer
    // move this booking themselves, and the page has to say which rule stopped it.
    if (error instanceof BookingPolicyError) return Response.json({ error: error.code, limit: error.limit }, { status: 422 });
    if (error instanceof ZodError) return Response.json({ error: "INVALID_RESCHEDULE" }, { status: 400 });
    return Response.json({ error: "INVALID_OR_EXPIRED_ACTION" }, { status: 403 });
  }
}
