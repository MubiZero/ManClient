import { requireBusinessAdmin } from "@/core/auth/business-session";
import { updateNotificationSettings } from "@/core/business-settings/notification-settings-service";
import { SettingsError } from "@/core/business-settings/settings-error";

export async function POST(request: Request) {
  const membership = await requireBusinessAdmin();
  const body = (await request.json()) as {
    notifyOnNewBooking?: boolean;
    notifyOnPaymentNeedsReview?: boolean;
    notifyOnCancellation?: boolean;
    cancellationPolicy?: string;
  };

  try {
    const updated = await updateNotificationSettings({
      businessId: membership.businessId,
      actorUserId: membership.userId,
      notifyOnNewBooking: Boolean(body.notifyOnNewBooking),
      notifyOnPaymentNeedsReview: Boolean(body.notifyOnPaymentNeedsReview),
      notifyOnCancellation: Boolean(body.notifyOnCancellation),
      cancellationPolicy: body.cancellationPolicy,
    });
    return Response.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  if (!(error instanceof SettingsError)) {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  const status = error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : 400;
  return Response.json({ error: error.code }, { status });
}
