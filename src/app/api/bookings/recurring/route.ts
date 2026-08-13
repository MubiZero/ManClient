import { ZodError } from "zod";

import { BookingConflictError } from "@/core/bookings/booking-allocation";
import { createBookingActionToken } from "@/core/bookings/booking-action-token";
import { createRecurringBooking } from "@/core/bookings/recurring-booking-service";
import { SettingsError } from "@/core/business-settings/settings-error";
import { prisma } from "@/core/database/prisma";
import { getPaymentUrl, PaymentConfigurationError } from "@/core/payments/payment-service";
import { readCustomerPhone } from "@/core/customers/customer-session";
import { assertPhoneVerified, spendPhoneVerification } from "@/core/security/phone-verification-gate";
import { PhoneVerificationError } from "@/core/security/phone-verification-service";
import { assertRateLimit, clientIdentifier, rateLimitedResponse, RateLimitedError } from "@/core/security/rate-limit";

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const customerPayload = (payload.customer ?? {}) as { phone?: unknown };
    const phone = typeof customerPayload.phone === "string" ? customerPayload.phone : "";
    const verificationId = typeof payload.phoneVerificationId === "string" ? payload.phoneVerificationId : null;

    await assertRateLimit("booking.recurring", `ip:${clientIdentifier(request)}`);
    if (phone) await assertRateLimit("booking.recurring", `phone:${phone}`);
    await assertPhoneVerified({ phone, verificationId, sessionPhone: await readCustomerPhone() });

    if (typeof payload.businessSlug !== "string") {
      return Response.json({ error: "INVALID_BOOKING" }, { status: 400 });
    }
    const business = await prisma.business.findUnique({
      where: { slug: payload.businessSlug },
      select: { id: true },
    });
    if (!business) {
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const result = await createRecurringBooking({
      businessId: business.id,
      branchId: String(payload.branchId ?? ""),
      serviceId: String(payload.serviceId ?? ""),
      staffId: String(payload.staffId ?? ""),
      customer: (payload.customer ?? {}) as { name: string; phone: string },
      startsAt: new Date(String(payload.startsAt)),
      frequency: payload.frequency as "WEEKLY" | "BIWEEKLY" | "MONTHLY",
      occurrencesTotal: Number(payload.occurrencesTotal),
      source: "WEB",
    });

    const firstBooking = result.created[0];
    if (!firstBooking) {
      return Response.json({ error: "SLOT_UNAVAILABLE" }, { status: 409 });
    }
    await spendPhoneVerification({ phone, verificationId });
    const payment = await prisma.payment.findUnique({ where: { bookingId: firstBooking.id } });
    if (!payment) {
      throw new Error("Payment was not created with the first recurring booking");
    }
    // Nothing due leaves no card to transfer to, and the series is already confirmed.
    const paymentUrl = payment.amountDiram > 0 ? (await getPaymentUrl(payment.id)).toString() : null;
    const paymentTokenExpiresAt = new Date(Math.max(firstBooking.expiresAt?.getTime() ?? 0, firstBooking.startsAt.getTime() + 24 * 60 * 60_000));
    const paymentToken = createBookingActionToken({ paymentId: payment.id, action: "view_payment", expiresAt: paymentTokenExpiresAt });

    return Response.json(
      {
        seriesId: result.seriesId,
        createdCount: result.created.length,
        skippedCount: result.skipped,
        paymentUrl,
        paymentPath: `/pay/${paymentToken}`,
      },
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
    if (error instanceof SettingsError) {
      const status = error.code === "PLAN_REQUIRED" ? 403 : error.code === "NOT_FOUND" ? 404 : 400;
      return Response.json({ error: error.code }, { status });
    }
    if (error instanceof ZodError) {
      return Response.json({ error: "INVALID_BOOKING" }, { status: 400 });
    }
    throw error;
  }
}
