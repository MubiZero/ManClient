import { ZodError } from "zod";

import { BookingConflictError, PromoCodeInvalidError } from "@/core/bookings/booking-allocation";
import { createBookingActionToken } from "@/core/bookings/booking-action-token";
import { BookingValidationError, createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import { getPaymentUrl, PaymentConfigurationError } from "@/core/payments/payment-service";
import { assertPhoneVerified, spendPhoneVerification } from "@/core/security/phone-verification-gate";
import { PhoneVerificationError } from "@/core/security/phone-verification-service";
import { assertRateLimit, clientIdentifier, rateLimitedResponse, RateLimitedError } from "@/core/security/rate-limit";
import { ANY_STAFF } from "@/app/api/availability/route";
import { resolveStaffForStart } from "@/core/availability/any-staff";

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const customer = (payload.customer ?? {}) as { phone?: unknown };
    const phone = typeof customer.phone === "string" ? customer.phone : "";
    const verificationId = typeof payload.phoneVerificationId === "string" ? payload.phoneVerificationId : null;

    await assertRateLimit("booking.create", `ip:${clientIdentifier(request)}`);
    // Also per phone: one script rotating through proxies still cannot fill a calendar under a single
    // number, and a customer who legitimately rebooks four times in ten minutes is unaffected.
    if (phone) await assertRateLimit("booking.create", `phone:${phone}`);
    await assertPhoneVerified({ phone, verificationId });

    const startsAt = new Date(String(payload.startsAt));
    // "Anyone" is answered here rather than inside the booking: a booking always names a specialist,
    // and choosing one before it is created keeps that true. Nobody free is the customer's answer,
    // not a reason to hand the visit to somebody who is busy.
    const staffId = payload.staffId === ANY_STAFF || !payload.staffId
      ? await resolveStaffForStart({
          branchId: String(payload.branchId),
          serviceId: String(payload.serviceId),
          startsAt,
        })
      : String(payload.staffId);
    if (!staffId) {
      return Response.json({ error: "SLOT_UNAVAILABLE" }, { status: 409 });
    }

    const booking = await createPendingBooking({
      ...payload,
      staffId,
      startsAt,
    } as Parameters<typeof createPendingBooking>[0]);
    await spendPhoneVerification({ phone, verificationId });
    // Nothing due means no card to transfer to and no reservation to race: the booking is already
    // confirmed, and the page the customer lands on says so instead of asking for a receipt.
    const paymentUrl = booking.prepayment.dueDiram > 0 ? (await getPaymentUrl(booking.paymentId)).toString() : null;
    const paymentTokenExpiresAt = new Date(Math.max(booking.expiresAt?.getTime() ?? 0, new Date(String(payload.startsAt)).getTime() + 24 * 60 * 60_000));
    const telegramUrl = await createTelegramStartUrl(booking.paymentId, booking.expiresAt ?? paymentTokenExpiresAt);
    const paymentToken = createBookingActionToken({ paymentId: booking.paymentId, action: "view_payment", expiresAt: paymentTokenExpiresAt });

    return Response.json(
      { ...booking, expiresAt: booking.expiresAt?.toISOString() ?? null, paymentUrl, telegramUrl, paymentPath: `/pay/${paymentToken}` },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return rateLimitedResponse(error);
    }

    if (error instanceof PhoneVerificationError) {
      return Response.json({ error: error.code }, { status: 403 });
    }

    if (error instanceof PaymentConfigurationError) {
      return Response.json({ error: error.code }, { status: 503 });
    }

    if (error instanceof BookingConflictError) {
      return Response.json({ error: error.code }, { status: 409 });
    }

    if (error instanceof PromoCodeInvalidError) {
      return Response.json({ error: "PROMO_CODE_INVALID", reason: error.code }, { status: 400 });
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
