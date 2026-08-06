import { requireBusinessAdmin } from "@/core/auth/business-session";
import { updateBookingPolicySettings } from "@/core/business-settings/booking-policy-service";
import { SettingsError } from "@/core/business-settings/settings-error";

export async function POST(request: Request) {
  const membership = await requireBusinessAdmin();
  const body = (await request.json()) as {
    minLeadTimeMinutes?: number | string;
    maxAdvanceDays?: number | string | null;
    freeCancellationHours?: number | string;
    maxCustomerReschedules?: number | string | null;
    cancellationPolicy?: string;
  };

  try {
    const updated = await updateBookingPolicySettings({
      businessId: membership.businessId,
      actorUserId: membership.userId,
      minLeadTimeMinutes: body.minLeadTimeMinutes ?? 0,
      maxAdvanceDays: body.maxAdvanceDays,
      freeCancellationHours: body.freeCancellationHours ?? 0,
      maxCustomerReschedules: body.maxCustomerReschedules,
      cancellationPolicy: body.cancellationPolicy,
    });
    return Response.json(updated);
  } catch (error) {
    if (!(error instanceof SettingsError)) return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
    const status = error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : 400;
    return Response.json({ error: error.code }, { status });
  }
}
