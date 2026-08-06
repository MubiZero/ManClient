import { z } from "zod";

import { PasswordResetError, requestPasswordReset } from "@/core/auth/password-reset";
import { PhoneVerificationError } from "@/core/security/phone-verification-service";
import { assertRateLimit, clientIdentifier, rateLimitedResponse, RateLimitedError } from "@/core/security/rate-limit";

const requestSchema = z.object({ phone: z.string().min(1) });

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = requestSchema.parse(await request.json());
    await assertRateLimit("auth.password_reset", `ip:${clientIdentifier(request)}`);
    await assertRateLimit("auth.password_reset", `phone:${payload.phone}`);

    const result = await requestPasswordReset(payload);
    // `verificationId: null` means no account owns this number. Still a 200 with the same shape, so
    // the endpoint cannot be used to enumerate accounts; the form simply never receives a valid id.
    return Response.json({ sent: result.verificationId !== null, verificationId: result.verificationId });
  } catch (error) {
    if (error instanceof RateLimitedError) return rateLimitedResponse(error);
    if (error instanceof z.ZodError) return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
    if (error instanceof PasswordResetError) {
      return Response.json({ error: error.code }, { status: error.code === "NOT_CONFIGURED" ? 503 : 400 });
    }
    if (error instanceof PhoneVerificationError) {
      const status = error.code === "RESEND_TOO_SOON" ? 429 : error.code === "SMS_FAILED" ? 502 : 400;
      return Response.json({ error: error.code, retryAfterSeconds: error.retryAfterSeconds }, { status });
    }
    throw error;
  }
}
