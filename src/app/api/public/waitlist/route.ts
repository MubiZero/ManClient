import { z } from "zod";

import { SettingsError } from "@/core/business-settings/settings-error";
import { joinWaitlist } from "@/core/bookings/waitlist-service";
import { prisma } from "@/core/database/prisma";
import { readCustomerPhone } from "@/core/customers/customer-session";
import { assertPhoneVerified, spendPhoneVerification } from "@/core/security/phone-verification-gate";
import { PhoneVerificationError } from "@/core/security/phone-verification-service";
import { assertRateLimit, clientIdentifier, rateLimitedResponse, RateLimitedError } from "@/core/security/rate-limit";

const requestSchema = z.object({
  businessSlug: z.string().min(1),
  branchId: z.string().min(1),
  serviceId: z.string().min(1),
  staffId: z.string().min(1).optional(),
  desiredFrom: z.string().min(1),
  desiredTo: z.string().min(1),
  customer: z.object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().min(1),
  }),
  phoneVerificationId: z.string().min(1).optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = requestSchema.parse(await request.json());
    // A waitlist entry is a promise to SMS this number when a slot frees, so an unverified entry is a
    // way to make the platform text a stranger.
    await assertRateLimit("waitlist.join", `ip:${clientIdentifier(request)}`);
    await assertRateLimit("waitlist.join", `phone:${payload.customer.phone}`);
    await assertPhoneVerified({ phone: payload.customer.phone, verificationId: payload.phoneVerificationId, sessionPhone: await readCustomerPhone() });

    const business = await prisma.business.findUnique({ where: { slug: payload.businessSlug }, select: { id: true } });
    if (!business) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

    const desiredFrom = new Date(payload.desiredFrom);
    const desiredTo = new Date(payload.desiredTo);
    if (Number.isNaN(desiredFrom.getTime()) || Number.isNaN(desiredTo.getTime())) {
      return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const entry = await joinWaitlist({
      businessId: business.id,
      branchId: payload.branchId,
      serviceId: payload.serviceId,
      staffId: payload.staffId,
      customer: payload.customer,
      desiredFrom,
      desiredTo,
    });

    await spendPhoneVerification({ phone: payload.customer.phone, verificationId: payload.phoneVerificationId });
    return Response.json({ ok: true, id: entry.id }, { status: 201 });
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return rateLimitedResponse(error);
    }
    if (error instanceof PhoneVerificationError) {
      return Response.json({ error: error.code }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
    }
    if (error instanceof SettingsError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "PLAN_REQUIRED" ? 403 : 400;
      return Response.json({ error: error.code }, { status });
    }
    throw error;
  }
}
