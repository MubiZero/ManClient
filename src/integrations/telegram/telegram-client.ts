export type TelegramReplyMarkup = { inline_keyboard: Array<Array<{ text: string; url?: string; callback_data?: string }>> };

export async function sendTelegramMessage(chatId: string, text: string, replyMarkup?: TelegramReplyMarkup): Promise<void> {
  await callTelegram("sendMessage", { chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
}

export async function downloadTelegramPhoto(fileId: string): Promise<Uint8Array> {
  const file = await callTelegram<{ file_path?: string }>("getFile", { file_id: fileId });
  if (!file.file_path) throw new Error("Telegram did not return a file path");
  const token = requiredToken();
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
  if (!response.ok) throw new Error(`Telegram file download failed with ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function callTelegram<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${requiredToken()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { ok: boolean; result?: T; description?: string };
  if (!response.ok || !payload.ok || payload.result === undefined) {
    throw new Error(`Telegram ${method} failed: ${payload.description ?? response.status}`);
  }
  return payload.result;
}

function requiredToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");
  return token;
}
