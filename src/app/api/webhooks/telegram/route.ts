import { handleTelegramUpdate } from "@/integrations/telegram/update-handler";
import { matchesWebhookSecret } from "@/integrations/telegram/webhook-auth";

export async function POST(request: Request): Promise<Response> {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const provided = request.headers.get("x-telegram-bot-api-secret-token");
  if (!matchesWebhookSecret(expected, provided)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  await handleTelegramUpdate(await request.json());
  return Response.json({ ok: true });
}
