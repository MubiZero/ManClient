import { ZodError } from "zod";

import { BookingConflictError } from "@/core/bookings/booking-allocation";
import { createBookingActionToken } from "@/core/bookings/booking-action-token";
import { BookingValidationError, createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
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
    const telegramUrl = await createTelegramStartUrl(booking.paymentId, booking.expiresAt);
    const paymentTokenExpiresAt = new Date(Math.max(booking.expiresAt.getTime(), new Date(String(payload.startsAt)).getTime() + 24 * 60 * 60_000));
    const paymentToken = createBookingActionToken({ paymentId: booking.paymentId, action: "view_payment", expiresAt: paymentTokenExpiresAt });

    return Response.json(
      { ...booking, expiresAt: booking.expiresAt.toISOString(), paymentUrl: paymentUrl.toString(), telegramUrl, paymentPath: `/pay/${paymentToken}` },
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

async function createTelegramStartUrl(paymentId: string, expiresAt: Date): Promise<string | null> {
  if (!process.env.BOOKING_ACTION_SECRET) return null;
  const integration = await prisma.businessTelegramIntegration.findFirst({
    where: { business: { payments: { some: { id: paymentId } } }, status: "ACTIVE" },
    select: { botUsername: true },
  });
  if (!integration) return null;
  const token = createBookingActionToken({ paymentId, action: "link_payment", expiresAt });
  const url = new URL(`https://t.me/${integration.botUsername.replace(/^@/, "")}`);
  url.searchParams.set("start", token);
  return url.toString();
}
