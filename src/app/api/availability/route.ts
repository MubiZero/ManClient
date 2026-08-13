import { z, ZodError } from "zod";

import { getAvailableStartsForService, listServiceStaffIds } from "@/core/availability/any-staff";
import { getAvailableStarts } from "@/core/availability/availability-service";
import { prisma } from "@/core/database/prisma";
import { localDateTimeToUtc } from "@/core/formatting/dushanbe-date";

/** What the form sends when the customer does not care who serves them. */
export const ANY_STAFF = "any";

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
    if (query.staffId === ANY_STAFF) {
      const staffIds = await listServiceStaffIds(query.branchId, query.serviceId);
      const starts = await getAvailableStartsForService({
        branchId: query.branchId,
        serviceId: query.serviceId,
        staffIds,
        from: query.date,
        days: 1,
      });
      return Response.json({ starts: starts.map((value) => value.toISOString()) });
    }

    const service = await prisma.service.findFirst({
      where: {
        id: query.serviceId,
        branchId: query.branchId,
        archivedAt: null,
        isPublished: true,
        staffMembers: { some: { id: query.staffId } },
      },
      select: {
        durationMinutes: true,
        branch: { select: { timeZone: true } },
        resources: { select: { resourceId: true } },
      },
    });
    if (!service) {
      return Response.json({ error: "INVALID_CONFIGURATION" }, { status: 404 });
    }

    const rangeStartsAt = localDateTimeToUtc(query.date, "00:00", service.branch.timeZone);
    const rangeEndsAt = localDateTimeToUtc(nextDate(query.date), "00:00", service.branch.timeZone);
    const starts = await getAvailableStarts({
      branchId: query.branchId,
      serviceId: query.serviceId,
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

function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
