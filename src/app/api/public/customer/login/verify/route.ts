import { z } from "zod";

import { startCustomerSession } from "@/core/customers/customer-session";
import { confirmPhoneVerification, consumeVerifiedPhone, PhoneVerificationError } from "@/core/security/phone-verification-service";
import { assertRateLimit, clientIdentifier, rateLimitedResponse, RateLimitedError } from "@/core/security/rate-limit";

const requestSchema = z.object({
  verificationId: z.string().min(1),
  phone: z.string().min(1),
  code: z.string().trim().regex(/^\d{6}$/),
});

/**
 * Turns a correct code into a session. The code is spent immediately — unlike a booking, nothing else
 * happens afterwards that could fail and leave the customer holding a code they paid an SMS for.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const payload = requestSchema.parse(await request.json());
    await assertRateLimit("phone.verify", `ip:${clientIdentifier(request)}`);

    const result = await confirmPhoneVerification(payload);
    if (result.purpose !== "CUSTOMER_LOGIN") throw new PhoneVerificationError("NOT_FOUND");
    await consumeVerifiedPhone({ verificationId: result.verificationId, phone: result.phone, purpose: "CUSTOMER_LOGIN" });
    await startCustomerSession(result.phone);

    return Response.json({ phone: result.phone });
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
