import { z } from "zod";

import {
  isPhoneVerificationConfigured,
  isPhoneVerificationRequired,
  PhoneVerificationError,
  requestPhoneVerification,
} from "@/core/security/phone-verification-service";
import { assertRateLimit, clientIdentifier, rateLimitedResponse, RateLimitedError } from "@/core/security/rate-limit";

const requestSchema = z.object({
  phone: z.string().min(1),
  purpose: z.enum(["BOOKING", "PASSWORD_RESET"]).default("BOOKING"),
  /** Names the salon in the SMS. Only the slug travels; the name itself is read from the database. */
  businessSlug: z.string().trim().min(1).max(120).optional(),
});

/**
 * Answers `enabled: false` rather than 404 when no moderated template exists, so the booking form can
 * ask once and then behave exactly as it did before verification existed.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const payload = requestSchema.parse(await request.json());
    if (!isPhoneVerificationConfigured()) {
      return Response.json({ enabled: false, required: false });
    }

    await assertRateLimit("phone.request", `ip:${clientIdentifier(request)}`);
    const result = await requestPhoneVerification({ phone: payload.phone, purpose: payload.purpose, businessSlug: payload.businessSlug });

    return Response.json(
      {
        enabled: true,
        required: isPhoneVerificationRequired(),
        verificationId: result.verificationId,
        expiresAt: result.expiresAt.toISOString(),
        resendAvailableInSeconds: result.resendAvailableInSeconds,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof RateLimitedError) return rateLimitedResponse(error);
    if (error instanceof z.ZodError) return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
    if (error instanceof PhoneVerificationError) {
      const status = error.code === "RESEND_TOO_SOON" ? 429 : error.code === "SMS_FAILED" ? 502 : 400;
      return Response.json({ error: error.code, retryAfterSeconds: error.retryAfterSeconds }, { status });
    }
    throw error;
  }
}
