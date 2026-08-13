import { z } from "zod";

import {
  isPhoneVerificationConfigured,
  PhoneVerificationError,
  requestPhoneVerification,
} from "@/core/security/phone-verification-service";
import { assertRateLimit, clientIdentifier, rateLimitedResponse, RateLimitedError } from "@/core/security/rate-limit";

const requestSchema = z.object({ phone: z.string().min(1) });

/**
 * Sends a customer the code that opens their own visits.
 *
 * No business is named in the SMS, on purpose: the same number belongs to several salons at once, and
 * a login code signed with one of their names would be both arbitrary and the exact shape of a
 * phishing message.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const payload = requestSchema.parse(await request.json());
    // Without a moderated template there is no way in at all, and the page needs to say that rather
    // than show a code field that can never be filled.
    if (!isPhoneVerificationConfigured()) return Response.json({ enabled: false });

    await assertRateLimit("phone.request", `ip:${clientIdentifier(request)}`);
    const result = await requestPhoneVerification({ phone: payload.phone, purpose: "CUSTOMER_LOGIN" });

    return Response.json(
      {
        enabled: true,
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
