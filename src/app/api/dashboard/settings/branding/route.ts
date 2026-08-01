import { requireBusinessAdmin } from "@/core/auth/business-session";
import { updateBusinessBranding } from "@/core/business-settings/branding-service";
import { SettingsError } from "@/core/business-settings/settings-error";

export async function POST(request: Request) {
  const membership = await requireBusinessAdmin();
  const formData = await request.formData();
  const logo = formData.get("logo");
  const brandColor = formData.get("brandColor");
  const removeLogo = formData.get("removeLogo") === "true";

  try {
    const updated = await updateBusinessBranding({
      businessId: membership.businessId,
      actorUserId: membership.userId,
      logoFile: logo instanceof File && logo.size > 0 ? logo : undefined,
      removeLogo,
      brandColor: typeof brandColor === "string" ? brandColor : undefined,
    });
    return Response.json({ hasLogo: Boolean(updated.logoStorageKey), brandColor: updated.brandColor });
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
