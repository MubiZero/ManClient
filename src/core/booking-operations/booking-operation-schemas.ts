import { z } from "zod";

import { todayInTimeZone } from "@/core/formatting/dushanbe-date";

const bookingStatuses = ["PENDING_PAYMENT", "CONFIRMED", "CANCELLED", "EXPIRED", "NO_SHOW"] as const;

export const bookingFiltersSchema = z.object({
  view: z.enum(["day", "week", "list"]).default("day"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(bookingStatuses).optional(),
  branchId: z.string().trim().min(1).max(128).optional(),
  staffId: z.string().trim().min(1).max(128).optional(),
  search: z.string().trim().max(80).default(""),
  cursor: z.string().trim().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export type BookingFilters = z.infer<typeof bookingFiltersSchema> & { date: string };

export function parseBookingFilters(input: unknown, timeZone: string, now = new Date()): BookingFilters {
  const parsed = bookingFiltersSchema.parse(input);
  return { ...parsed, date: parsed.date ?? todayInTimeZone(timeZone, now) };
}
