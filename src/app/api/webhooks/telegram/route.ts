import { timingSafeEqual } from "node:crypto";

import { handleTelegramUpdate } from "@/integrations/telegram/update-handler";

export async function POST(request: Request): Promise<Response> {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const provided = request.headers.get("x-telegram-bot-api-secret-token");
  if (!matchesSecret(expected, provided)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  await handleTelegramUpdate(await request.json());
  return Response.json({ ok: true });
}

function matchesSecret(expected: string | undefined, provided: string | null): boolean {
  if (!expected || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}
