import { z } from "zod";

import { SettingsError } from "@/core/business-settings/settings-error";
import { joinWaitlist } from "@/core/bookings/waitlist-service";
import { prisma } from "@/core/database/prisma";

const requestSchema = z.object({
  businessSlug: z.string().min(1),
  branchId: z.string().min(1),
  serviceId: z.string().min(1),
  staffId: z.string().min(1).optional(),
  desiredFrom: z.string().min(1),
  desiredTo: z.string().min(1),
  customer: z.object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().min(1),
  }),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = requestSchema.parse(await request.json());
    const business = await prisma.business.findUnique({ where: { slug: payload.businessSlug }, select: { id: true } });
    if (!business) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

    const desiredFrom = new Date(payload.desiredFrom);
    const desiredTo = new Date(payload.desiredTo);
    if (Number.isNaN(desiredFrom.getTime()) || Number.isNaN(desiredTo.getTime())) {
      return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const entry = await joinWaitlist({
      businessId: business.id,
      branchId: payload.branchId,
      serviceId: payload.serviceId,
      staffId: payload.staffId,
      customer: payload.customer,
      desiredFrom,
      desiredTo,
    });

    return Response.json({ ok: true, id: entry.id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
    }
    if (error instanceof SettingsError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "PLAN_REQUIRED" ? 403 : 400;
      return Response.json({ error: error.code }, { status });
    }
    throw error;
  }
}
