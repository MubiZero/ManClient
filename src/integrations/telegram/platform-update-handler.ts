import { connectBusinessTelegramBot } from "@/core/integrations/business-telegram-service";
import { consumePlatformChatLink, getPlatformTelegramActor } from "@/core/integrations/platform-chat-link";
import { handleBusinessBotUpdate } from "@/integrations/telegram/business-bot-handler";
import { createTelegramApi, type TelegramReplyMarkup } from "@/integrations/telegram/telegram-api";

type TelegramUser = { id: number };
type TelegramChat = { id: number; type: "private" | "group" | "supergroup" | "channel" };

export type PlatformTelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    from: TelegramUser;
    chat: TelegramChat;
    text?: string;
  };
  callback_query?: {
    id?: string;
    from: TelegramUser;
    message?: { message_id: number; chat: TelegramChat };
    data?: string;
  };
};

type PlatformHandlerDependencies = {
  now: () => Date;
  sendMessage: (chatId: string, text: string, replyMarkup?: TelegramReplyMarkup) => Promise<void>;
  deleteMessage: (chatId: string, messageId: number) => Promise<void>;
  connectBot: (input: { businessId: string; actorUserId: string; token: string }) => Promise<{ botUsername: string }>;
  answerCallbackQuery?: (callbackQueryId: string, text?: string) => Promise<void>;
  editMessageText?: ReturnType<typeof createTelegramApi>["editMessageText"];
};

const botTokenPattern = /^\d+:[A-Za-z0-9_-]+$/;

export async function handlePlatformTelegramUpdate(
  update: PlatformTelegramUpdate,
  dependencies: PlatformHandlerDependencies = defaultDependencies(),
) {
  const message = update.message;
  const actor = telegramActorFromUpdate(update);
  if (!actor) return;

  if (update.callback_query?.message) {
    if (update.callback_query.id && dependencies.answerCallbackQuery) {
      await dependencies.answerCallbackQuery(update.callback_query.id);
    }
    const platformActor = await getPlatformTelegramActor(actor);
    if (!platformActor) return;
    await handleBusinessBotUpdate({
      ...platformActor,
      telegramUserId: actor.telegramUserId,
    }, update, {
      now: dependencies.now,
      sendMessage: dependencies.sendMessage,
      answerCallbackQuery: async () => {},
      editMessageText: dependencies.editMessageText ?? (async (message, text, replyMarkup) => {
        await dependencies.sendMessage(message.chatId, text, replyMarkup);
        return message;
      }),
    });
    return;
  }

  if (!message?.text) return;
  const text = message.text.trim();

  if (text.startsWith("/start b_")) {
    try {
      const membership = await consumePlatformChatLink(text.slice(9).trim(), actor, dependencies.now());
      await dependencies.sendMessage(actor.chatId, `Бизнес «${membership.business.name}» подключён к этому чату. Теперь можно отправить токен клиентского Telegram-бота.`);
    } catch {
      await dependencies.sendMessage(actor.chatId, "Ссылка подключения недействительна или истекла. Создайте новую ссылку в кабинете ManClient.");
    }
    return;
  }

  if (botTokenPattern.test(text)) {
    try {
      await dependencies.deleteMessage(actor.chatId, message.message_id);
    } catch {
      // Continue without repeating the credential; dashboard entry remains the safer path.
    }
    const platformActor = await getPlatformTelegramActor(actor);
    if (!platformActor || !["OWNER", "ADMIN"].includes(platformActor.role)) {
      await dependencies.sendMessage(actor.chatId, "Сначала привяжите этот чат к бизнесу через кабинет ManClient.");
      return;
    }
    try {
      const connected = await dependencies.connectBot({
        businessId: platformActor.businessId,
        actorUserId: platformActor.userId,
        token: text,
      });
      await dependencies.sendMessage(actor.chatId, `Клиентский бот @${connected.botUsername} подключён.`);
    } catch {
      await dependencies.sendMessage(actor.chatId, "Не удалось подключить бота. Проверьте токен или откройте настройки интеграции в кабинете.");
    }
    return;
  }

  const loginUrl = `${requiredAppUrl()}/login`;
  const platformActor = await getPlatformTelegramActor(actor);
  if (platformActor) {
    await handleBusinessBotUpdate({
      ...platformActor,
      telegramUserId: actor.telegramUserId,
    }, update, {
      now: dependencies.now,
      sendMessage: dependencies.sendMessage,
      answerCallbackQuery: dependencies.answerCallbackQuery ?? (async () => {}),
      editMessageText: dependencies.editMessageText ?? (async (messageRef, messageText, replyMarkup) => {
        await dependencies.sendMessage(messageRef.chatId, messageText, replyMarkup);
        return messageRef;
      }),
    });
    return;
  }
  await dependencies.sendMessage(actor.chatId, "ManClient — помощник для управления записью вашего бизнеса. Войдите в кабинет, чтобы подключить компанию.", {
    inline_keyboard: [[{ text: "Войти в кабинет", url: loginUrl }]],
  });
}

function telegramActorFromUpdate(update: PlatformTelegramUpdate) {
  if (update.message) {
    return {
      chatId: String(update.message.chat.id),
      chatType: update.message.chat.type,
      telegramUserId: String(update.message.from.id),
    };
  }
  if (update.callback_query?.message) {
    return {
      chatId: String(update.callback_query.message.chat.id),
      chatType: update.callback_query.message.chat.type,
      telegramUserId: String(update.callback_query.from.id),
    };
  }
  return null;
}

function defaultDependencies(): PlatformHandlerDependencies {
  const telegram = createTelegramApi(requiredPlatformToken());
  return {
    now: () => new Date(),
    sendMessage: telegram.sendMessage,
    deleteMessage: telegram.deleteMessage,
    connectBot: input => connectBusinessTelegramBot(input),
    answerCallbackQuery: telegram.answerCallbackQuery,
    editMessageText: telegram.editMessageText,
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
