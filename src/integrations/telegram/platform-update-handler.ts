import { connectBusinessTelegramBot } from "@/core/integrations/business-telegram-service";
import {
  claimManagedBotIntent,
  completeManagedBotIntent,
  createManagedBotIntent,
  failManagedBotIntent,
} from "@/core/integrations/managed-bot-intent";
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
  managed_bot?: {
    user: { id: number };
    bot: { id: number; is_bot: boolean; username?: string };
  };
};

type PlatformHandlerDependencies = {
  now: () => Date;
  sendMessage: (chatId: string, text: string, replyMarkup?: TelegramReplyMarkup) => Promise<void>;
  deleteMessage: (chatId: string, messageId: number) => Promise<void>;
  connectBot: (input: {
    businessId: string;
    actorUserId: string;
    token: string;
    connectionMethod?: "TOKEN" | "MANAGED";
    managedOwnerTelegramUserId?: string;
    expectedBotId?: string;
  }) => Promise<{ botUsername: string }>;
  getManagedBotToken: (botId: number) => Promise<string>;
  answerCallbackQuery?: (callbackQueryId: string, text?: string) => Promise<void>;
  editMessageText?: ReturnType<typeof createTelegramApi>["editMessageText"];
  sendPhoto?: ReturnType<typeof createTelegramApi>["sendPhoto"];
};

const botTokenPattern = /^\d+:[A-Za-z0-9_-]+$/;

export async function handlePlatformTelegramUpdate(
  update: PlatformTelegramUpdate,
  dependencies: PlatformHandlerDependencies = defaultDependencies(),
) {
  if (update.managed_bot) {
    await handleManagedBotUpdate(update.managed_bot, dependencies);
    return;
  }
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
      sendPhoto: dependencies.sendPhoto,
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
    if (text === "Создать клиентского бота") {
      await startManagedBotCreation({
        ...platformActor,
        telegramUserId: actor.telegramUserId,
      }, dependencies);
      return;
    }
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
      sendPhoto: dependencies.sendPhoto,
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
    getManagedBotToken: telegram.getManagedBotToken,
    answerCallbackQuery: telegram.answerCallbackQuery,
    editMessageText: telegram.editMessageText,
    sendPhoto: telegram.sendPhoto,
  };
}

async function startManagedBotCreation(
  actor: Awaited<ReturnType<typeof getPlatformTelegramActor>> & { telegramUserId: string },
  dependencies: PlatformHandlerDependencies,
) {
  if (!actor || actor.destination.chatType !== "private" || !["OWNER", "ADMIN"].includes(actor.role)) {
    await dependencies.sendMessage(actor?.destination.chatId ?? actor?.telegramUserId ?? "", "Создание клиентского бота доступно владельцу или администратору в личном чате с @manclient_bot.");
    return;
  }
  const platformUsername = requiredPlatformUsername();
  const suggestedUsername = managedBotUsername(actor.business.name, actor.businessId);
  const displayName = actor.business.name.slice(0, 64);
  await createManagedBotIntent({
    membershipId: actor.membershipId,
    businessId: actor.businessId,
    userId: actor.userId,
    role: actor.role,
    telegramUserId: actor.telegramUserId,
  }, { displayName, suggestedUsername }, dependencies.now());
  const url = new URL(`https://t.me/newbot/${platformUsername}/${suggestedUsername}`);
  url.searchParams.set("name", displayName);
  await dependencies.sendMessage(actor.destination.chatId, "Telegram покажет создание клиентского бота. Бот сразу будет принадлежать вам, а ManClient подключит его автоматически.", {
    inline_keyboard: [[{ text: "Создать клиентского бота", url: url.toString() }]],
  });
}

async function handleManagedBotUpdate(
  update: NonNullable<PlatformTelegramUpdate["managed_bot"]>,
  dependencies: PlatformHandlerDependencies,
) {
  const telegramUserId = String(update.user.id);
  const botId = String(update.bot.id);
  let intent: Awaited<ReturnType<typeof claimManagedBotIntent>>;
  try {
    intent = await claimManagedBotIntent({ telegramUserId, botId }, dependencies.now());
  } catch {
    await dependencies.sendMessage(telegramUserId, "Не удалось определить бизнес для этого бота. Откройте нужный бизнес в ManClient и запустите создание ещё раз.");
    return;
  }
  if (intent.status === "COMPLETED") {
    await dependencies.sendMessage(telegramUserId, `Клиентский бот${update.bot.username ? ` @${update.bot.username}` : ""} уже подключён.`);
    return;
  }
  try {
    const token = await dependencies.getManagedBotToken(update.bot.id);
    const connected = await dependencies.connectBot({
      businessId: intent.businessId,
      actorUserId: intent.membership.userId,
      token,
      connectionMethod: "MANAGED",
      managedOwnerTelegramUserId: telegramUserId,
      expectedBotId: botId,
    });
    await completeManagedBotIntent(intent.id, botId, dependencies.now());
    await dependencies.sendMessage(telegramUserId, `Клиентский бот @${connected.botUsername} подключён. Он принадлежит вам; ManClient управляет только интеграцией.`);
  } catch {
    await failManagedBotIntent(intent.id, "CONNECTION_FAILED");
    await dependencies.sendMessage(telegramUserId, "Бот создан и принадлежит вам, но ManClient пока не смог подключить его. Повторите подключение позже — создавать нового бота не нужно.");
  }
}

function managedBotUsername(businessName: string, businessId: string) {
  const normalized = businessName.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const base = normalized || `client_${businessId.replace(/[^a-z0-9]/gi, "").slice(-8).toLowerCase()}`;
  return `${base.slice(0, 28).replace(/_+$/g, "")}_bot`;
}

function requiredPlatformUsername() {
  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  if (!username) throw new Error("TELEGRAM_BOT_USERNAME is required");
  return username;
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
