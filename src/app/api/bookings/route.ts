import { ZodError } from "zod";

import { BookingConflictError } from "@/core/bookings/booking-allocation";
import { createBookingActionToken } from "@/core/bookings/booking-action-token";
import { BookingValidationError, createPendingBooking } from "@/core/bookings/booking-service";
import {
  assertPaymentCardConfigured,
  getPaymentUrl,
  PaymentConfigurationError,
} from "@/core/payments/payment-service";

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    if (typeof payload.branchId === "string") {
      await assertPaymentCardConfigured(payload.branchId);
    }
    const booking = await createPendingBooking({
      ...payload,
      startsAt: new Date(String(payload.startsAt)),
    } as Parameters<typeof createPendingBooking>[0]);
    const paymentUrl = await getPaymentUrl(booking.paymentId);
    const telegramUrl = createTelegramStartUrl(booking.paymentId, booking.expiresAt);

    return Response.json(
      { ...booking, expiresAt: booking.expiresAt.toISOString(), paymentUrl: paymentUrl.toString(), telegramUrl },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof PaymentConfigurationError) {
      return Response.json({ error: error.code }, { status: 503 });
    }

    if (error instanceof BookingConflictError) {
      return Response.json({ error: error.code }, { status: 409 });
    }

    if (error instanceof ZodError || error instanceof BookingValidationError) {
      return Response.json({ error: "INVALID_BOOKING" }, { status: 400 });
    }

    throw error;
  }
}

function createTelegramStartUrl(paymentId: string, expiresAt: Date): string | null {
  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  if (!botUsername || !process.env.BOOKING_ACTION_SECRET) return null;
  const token = createBookingActionToken({ paymentId, action: "link_payment", expiresAt });
  const url = new URL(`https://t.me/${botUsername.replace(/^@/, "")}`);
  url.searchParams.set("start", token);
  return url.toString();
}
