import { ZodError } from "zod";

import { BookingConflictError } from "@/core/bookings/booking-allocation";
import { BookingValidationError, createPendingBooking } from "@/core/bookings/booking-service";

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const booking = await createPendingBooking({
      ...payload,
      startsAt: new Date(String(payload.startsAt)),
    } as Parameters<typeof createPendingBooking>[0]);

    return Response.json(
      { ...booking, expiresAt: booking.expiresAt.toISOString() },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof BookingConflictError) {
      return Response.json({ error: error.code }, { status: 409 });
    }

    if (error instanceof ZodError || error instanceof BookingValidationError) {
      return Response.json({ error: "INVALID_BOOKING" }, { status: 400 });
    }

    throw error;
  }
}
