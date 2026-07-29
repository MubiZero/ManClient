import { connectBusinessTelegramBot } from "@/core/integrations/business-telegram-service";
import { consumePlatformChatLink, getActivePlatformChatMembership } from "@/core/integrations/platform-chat-link";
import { createTelegramApi, type TelegramInlineKeyboard } from "@/integrations/telegram/telegram-api";

export type PlatformTelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
  };
};

type PlatformHandlerDependencies = {
  now: () => Date;
  sendMessage: (chatId: string, text: string, replyMarkup?: TelegramInlineKeyboard) => Promise<void>;
  deleteMessage: (chatId: string, messageId: number) => Promise<void>;
  connectBot: (input: { businessId: string; actorUserId: string; token: string }) => Promise<{ botUsername: string }>;
};

const botTokenPattern = /^\d+:[A-Za-z0-9_-]+$/;

export async function handlePlatformTelegramUpdate(
  update: PlatformTelegramUpdate,
  dependencies: PlatformHandlerDependencies = defaultDependencies(),
) {
  const message = update.message;
  if (!message?.text) return;
  const chatId = String(message.chat.id);
  const text = message.text.trim();

  if (text.startsWith("/start b_")) {
    try {
      const membership = await consumePlatformChatLink(text.slice(9).trim(), chatId, dependencies.now());
      await dependencies.sendMessage(chatId, `Бизнес «${membership.business.name}» подключён к этому чату. Теперь можно отправить токен клиентского Telegram-бота.`);
    } catch {
      await dependencies.sendMessage(chatId, "Ссылка подключения недействительна или истекла. Создайте новую ссылку в кабинете ManClient.");
    }
    return;
  }

  if (botTokenPattern.test(text)) {
    try {
      await dependencies.deleteMessage(chatId, message.message_id);
    } catch {
      // Continue without repeating the credential; dashboard entry remains the safer path.
    }
    const membership = await getActivePlatformChatMembership(chatId);
    if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
      await dependencies.sendMessage(chatId, "Сначала привяжите этот чат к бизнесу через кабинет ManClient.");
      return;
    }
    try {
      const connected = await dependencies.connectBot({
        businessId: membership.businessId,
        actorUserId: membership.userId,
        token: text,
      });
      await dependencies.sendMessage(chatId, `Клиентский бот @${connected.botUsername} подключён.`);
    } catch {
      await dependencies.sendMessage(chatId, "Не удалось подключить бота. Проверьте токен или откройте настройки интеграции в кабинете.");
    }
    return;
  }

  const loginUrl = `${requiredAppUrl()}/login`;
  const membership = await getActivePlatformChatMembership(chatId);
  if (membership) {
    await dependencies.sendMessage(chatId, `ManClient для бизнеса «${membership.business.name}». Управление услугами, сотрудниками и интеграциями доступно в кабинете.`, {
      inline_keyboard: [[{ text: "Открыть кабинет", url: loginUrl }]],
    });
    return;
  }
  await dependencies.sendMessage(chatId, "ManClient — помощник для управления записью вашего бизнеса. Войдите в кабинет, чтобы подключить компанию.", {
    inline_keyboard: [[{ text: "Войти в кабинет", url: loginUrl }]],
  });
}

function defaultDependencies(): PlatformHandlerDependencies {
  const telegram = createTelegramApi(requiredPlatformToken());
  return {
    now: () => new Date(),
    sendMessage: telegram.sendMessage,
    deleteMessage: telegram.deleteMessage,
    connectBot: input => connectBusinessTelegramBot(input),
  };
}

function requiredPlatformToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");
  return token;
}

function requiredAppUrl() {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL is required");
  return appUrl.replace(/\/$/, "");
}
