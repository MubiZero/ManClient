import { claimInboundUpdate } from "@/core/integrations/inbound-update-service";
import {
  dispatchLoadedBusinessTelegramUpdate,
  loadBusinessTelegramContext,
  type BusinessTelegramUpdate,
} from "@/integrations/telegram/business-update-dispatcher";
import { matchesWebhookSecret } from "@/integrations/telegram/webhook-auth";

type RouteContext = { params: Promise<{ publicId: string }> };

export async function POST(request: Request, routeContext: RouteContext) {
  const { publicId } = await routeContext.params;
  const integration = await loadBusinessTelegramContext(publicId);
  if (!integration) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!matchesWebhookSecret(
    integration.webhookSecret,
    request.headers.get("x-telegram-bot-api-secret-token"),
  )) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const update = await request.json() as BusinessTelegramUpdate;
  if (!Number.isSafeInteger(update.update_id)) {
    return Response.json({ error: "INVALID_UPDATE" }, { status: 400 });
  }
  const claimed = await claimInboundUpdate({
    integrationId: integration.integrationId,
    externalUpdateId: String(update.update_id),
  });
  if (!claimed) return Response.json({ ok: true, duplicate: true });

  await dispatchLoadedBusinessTelegramUpdate({
    businessId: integration.businessId,
    integrationId: integration.integrationId,
    token: integration.token,
  }, update);
  return Response.json({ ok: true });
}
