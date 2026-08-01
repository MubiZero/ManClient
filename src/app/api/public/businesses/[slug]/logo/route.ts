import { getLogo } from "@/core/business-settings/branding-storage";
import { prisma } from "@/core/database/prisma";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_: Request, context: RouteContext) {
  const { slug } = await context.params;
  const business = await prisma.business.findUnique({ where: { slug }, select: { logoStorageKey: true } });
  if (!business?.logoStorageKey) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const logo = await getLogo(business.logoStorageKey);
  return new Response(Buffer.from(logo.body), {
    headers: {
      "content-type": logo.contentType,
      "cache-control": "public, max-age=300, stale-while-revalidate=86400",
    },
  });
}
