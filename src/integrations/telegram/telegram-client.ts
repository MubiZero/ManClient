import { createTelegramApi, type TelegramReplyMarkup as ApiTelegramReplyMarkup } from "@/integrations/telegram/telegram-api";

export type TelegramReplyMarkup = ApiTelegramReplyMarkup;

export async function sendTelegramMessage(chatId: string, text: string, replyMarkup?: TelegramReplyMarkup): Promise<void> {
  await platformApi().sendMessage(chatId, text, replyMarkup);
}

export async function downloadTelegramPhoto(fileId: string): Promise<Uint8Array> {
  const api = platformApi();
  const file = await api.getFile(fileId);
  return api.downloadFile(file.filePath);
}

function requiredToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");
  return token;
}

function platformApi() {
  return createTelegramApi(requiredToken());
}
