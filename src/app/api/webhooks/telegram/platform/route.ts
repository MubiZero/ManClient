import { matchesWebhookSecret } from "@/core/security/webhook-auth";
import { handlePlatformTelegramUpdate } from "@/integrations/telegram/platform-update-handler";

export async function POST(request: Request) {
  if (!matchesWebhookSecret(
    process.env.TELEGRAM_WEBHOOK_SECRET,
    request.headers.get("x-telegram-bot-api-secret-token"),
  )) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  await handlePlatformTelegramUpdate(await request.json());
  return Response.json({ ok: true });
}
