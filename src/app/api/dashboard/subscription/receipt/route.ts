import { requireBusinessAdmin } from "@/core/auth/business-session";
import { PlatformError } from "@/core/platform/platform-error";
import { submitSubscriptionReceipt } from "@/core/platform/subscription-receipt-service";
import { assertRateLimit, clientIdentifier, rateLimitedResponse, RateLimitedError } from "@/core/security/rate-limit";

export async function POST(request: Request) {
  // Bounds the OCR work one caller can trigger, the same way the customer-facing upload does.
  try {
    await assertRateLimit("receipt.upload", `ip:${clientIdentifier(request)}`);
  } catch (error) {
    if (error instanceof RateLimitedError) return rateLimitedResponse(error);
    throw error;
  }

  // Only an owner or administrator pays the bills; a specialist has no business seeing them.
  const membership = await requireBusinessAdmin();

  const data = await request.formData();
  const file = data.get("receipt");
  if (!(file instanceof File)) return Response.json({ error: "INVALID_INPUT" }, { status: 400 });

  try {
    const receipt = await submitSubscriptionReceipt({
      businessId: membership.businessId,
      bytes: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type,
    });
    return Response.json({ status: receipt.status }, { status: 201 });
  } catch (error) {
    if (error instanceof PlatformError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "DUPLICATE_OPERATION" ? 409 : 400;
      return Response.json({ error: error.code }, { status });
    }
    return Response.json({ error: "PROCESSING_FAILED" }, { status: 500 });
  }
}
