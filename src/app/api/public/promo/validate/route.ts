import { prisma } from "@/core/database/prisma";
import { validatePromoCode } from "@/core/promotions/promo-code-service";
import { assertRateLimit, clientIdentifier, rateLimitedResponse, RateLimitedError } from "@/core/security/rate-limit";

export async function POST(request: Request): Promise<Response> {
  // Without a limit this endpoint is a free oracle for guessing a business's promo codes.
  try {
    await assertRateLimit("promo.validate", `ip:${clientIdentifier(request)}`);
  } catch (error) {
    if (error instanceof RateLimitedError) return rateLimitedResponse(error);
    throw error;
  }

  const payload = (await request.json()) as Record<string, unknown>;
  const businessSlug = typeof payload.businessSlug === "string" ? payload.businessSlug : "";
  const code = typeof payload.code === "string" ? payload.code : "";
  const serviceId = typeof payload.serviceId === "string" ? payload.serviceId : "";

  if (!businessSlug || !code || !serviceId) {
    return Response.json({ valid: false, reason: "NOT_FOUND" }, { status: 400 });
  }

  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: {
      id: true,
      branches: {
        select: {
          services: {
            where: { id: serviceId, archivedAt: null, isPublished: true },
            select: { amountDiram: true },
          },
        },
      },
    },
  });

  const service = business?.branches.flatMap((branch) => branch.services)[0];
  if (!business || !service) {
    return Response.json({ valid: false, reason: "NOT_FOUND" }, { status: 404 });
  }

  const result = await validatePromoCode({
    businessId: business.id,
    code,
    serviceAmountDiram: service.amountDiram,
  });

  if (!result.valid) {
    return Response.json({ valid: false, reason: result.reason });
  }

  return Response.json({
    valid: true,
    discountDiram: result.discountDiram,
    finalAmountDiram: result.finalAmountDiram,
  });
}
