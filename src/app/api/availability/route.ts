import { z, ZodError } from "zod";

import { getAvailableStarts } from "@/core/availability/availability-service";
import { prisma } from "@/core/database/prisma";

const querySchema = z.object({
  branchId: z.string().min(1),
  serviceId: z.string().min(1),
  staffId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const query = querySchema.parse(Object.fromEntries(url.searchParams));
    const service = await prisma.service.findFirst({
      where: {
        id: query.serviceId,
        branchId: query.branchId,
        staffMembers: { some: { id: query.staffId } },
      },
      select: {
        durationMinutes: true,
        resources: { select: { resourceId: true } },
      },
    });
    if (!service) {
      return Response.json({ error: "INVALID_CONFIGURATION" }, { status: 404 });
    }

    const rangeStartsAt = new Date(`${query.date}T00:00:00+05:00`);
    const rangeEndsAt = new Date(rangeStartsAt.getTime() + 24 * 60 * 60_000);
    const starts = await getAvailableStarts({
      branchId: query.branchId,
      staffId: query.staffId,
      resourceIds: service.resources.map(({ resourceId }) => resourceId),
      rangeStartsAt,
      rangeEndsAt,
      durationMinutes: service.durationMinutes,
      intervalMinutes: 30,
    });

    return Response.json({ starts: starts.map((value) => value.toISOString()) });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: "INVALID_QUERY" }, { status: 400 });
    }

    throw error;
  }
}
