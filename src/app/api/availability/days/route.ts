import { z, ZodError } from "zod";

import { getAvailableDays } from "@/core/availability/availability-service";

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
    return Response.json({ days: await getAvailableDays(query) });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: "INVALID_QUERY" }, { status: 400 });
    }

    throw error;
  }
}
