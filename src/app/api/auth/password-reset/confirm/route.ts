import { z } from "zod";

import { completePasswordReset, PasswordResetError } from "@/core/auth/password-reset";
import { PhoneVerificationError } from "@/core/security/phone-verification-service";
import { assertRateLimit, clientIdentifier, rateLimitedResponse, RateLimitedError } from "@/core/security/rate-limit";

const requestSchema = z.object({
  verificationId: z.string().min(1),
  phone: z.string().min(1),
  code: z.string().trim().regex(/^\d{6}$/),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = requestSchema.parse(await request.json());
    await assertRateLimit("phone.verify", `ip:${clientIdentifier(request)}`);

    await completePasswordReset(payload);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof RateLimitedError) return rateLimitedResponse(error);
    if (error instanceof z.ZodError) return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
    if (error instanceof PasswordResetError) return Response.json({ error: error.code }, { status: 400 });
    if (error instanceof PhoneVerificationError) {
      const status = error.code === "TOO_MANY_ATTEMPTS" ? 429 : error.code === "NOT_FOUND" ? 404 : 400;
      return Response.json({ error: error.code }, { status });
    }
    throw error;
  }
}
