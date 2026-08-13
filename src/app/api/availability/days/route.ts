import { z, ZodError } from "zod";

import { ANY_STAFF } from "@/app/api/availability/route";
import { getAvailableStartsForService, listServiceStaffIds } from "@/core/availability/any-staff";
import { getAvailableDays } from "@/core/availability/availability-service";
import { prisma } from "@/core/database/prisma";
import { todayInTimeZone } from "@/core/formatting/dushanbe-date";

const querySchema = z.object({
  branchId: z.string().min(1),
  serviceId: z.string().min(1),
  staffId: z.string().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.coerce.number().int().min(1).max(31).default(14),
});

/**
 * Which of the coming days have room. The form asks once and draws a strip of dates, instead of
 * making the customer guess a date and wait to be told there is nothing on it.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const query = querySchema.parse(Object.fromEntries(url.searchParams));
    if (query.staffId === ANY_STAFF) return Response.json({ days: await anyStaffDays(query) });
    return Response.json({ days: await getAvailableDays(query) });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: "INVALID_QUERY" }, { status: 400 });
    }

    throw error;
  }
}

/** The same strip, but a day counts as free when anybody who performs the service can take it. */
async function anyStaffDays(query: { branchId: string; serviceId: string; from: string; days: number }) {
  const branch = await prisma.branch.findUnique({ where: { id: query.branchId }, select: { timeZone: true } });
  if (!branch) return [];
  const staffIds = await listServiceStaffIds(query.branchId, query.serviceId);
  const starts = await getAvailableStartsForService({ ...query, staffIds });
  const free = new Set(starts.map((start) => todayInTimeZone(branch.timeZone, start)));
  return Array.from({ length: query.days }, (_, offset) => {
    const value = new Date(`${query.from}T12:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + offset);
    const date = value.toISOString().slice(0, 10);
    return { date, hasSlots: free.has(date) };
  });
}
