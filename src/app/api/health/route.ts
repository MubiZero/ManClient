import { prisma } from "@/core/database/prisma";

export async function GET(): Promise<Response> {
  try {
    await prisma.$queryRaw`SELECT 1 AS ready`;

    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
