import { requireBusinessAdmin } from "@/core/auth/business-session";
import { updateWhatsAppSettings } from "@/core/business-settings/whatsapp-settings-service";
import { SettingsError } from "@/core/business-settings/settings-error";

export async function POST(request: Request) {
  const membership = await requireBusinessAdmin();
  const body = (await request.json()) as {
    phoneNumberId?: string;
    templateName?: string;
    confirmationTemplateName?: string;
    cancellationTemplateName?: string;
    languageCode?: string;
  };

  try {
    const updated = await updateWhatsAppSettings({
      businessId: membership.businessId,
      actorUserId: membership.userId,
      phoneNumberId: body.phoneNumberId,
      templateName: body.templateName,
      confirmationTemplateName: body.confirmationTemplateName,
      cancellationTemplateName: body.cancellationTemplateName,
      languageCode: body.languageCode,
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
