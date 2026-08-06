import { z } from "zod";

import { confirmPhoneVerification, PhoneVerificationError } from "@/core/security/phone-verification-service";
import { assertRateLimit, clientIdentifier, rateLimitedResponse, RateLimitedError } from "@/core/security/rate-limit";

const requestSchema = z.object({
  verificationId: z.string().min(1),
  phone: z.string().min(1),
  code: z.string().trim().regex(/^\d{6}$/),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = requestSchema.parse(await request.json());
    // Per-row attempts already cap guessing against one code; this caps a script that keeps asking
    // for new codes and burning five attempts on each.
    await assertRateLimit("phone.verify", `ip:${clientIdentifier(request)}`);
    const result = await confirmPhoneVerification(payload);

    return Response.json({ verified: true, verificationId: result.verificationId });
  } catch (error) {
    if (error instanceof RateLimitedError) return rateLimitedResponse(error);
    if (error instanceof z.ZodError) return Response.json({ error: "INVALID_CODE" }, { status: 400 });
    if (error instanceof PhoneVerificationError) {
      const status = error.code === "TOO_MANY_ATTEMPTS" ? 429 : error.code === "NOT_FOUND" ? 404 : 400;
      return Response.json({ error: error.code }, { status });
    }
    throw error;
  }
}
