import { connectBusinessTelegramBot, findConnectedBusinessTelegramBot } from "@/core/integrations/business-telegram-service";
import {
  claimManagedBotIntent,
  completeManagedBotIntent,
  createManagedBotIntent,
  failManagedBotIntent,
  ManagedBotIntentBusyError,
} from "@/core/integrations/managed-bot-intent";
import { consumePlatformChatLink, getPlatformTelegramActor } from "@/core/integrations/platform-chat-link";
import {
  botMessage,
  customerBotAlreadyConnectedMessage,
  managedBotConnectedFinalMessage,
  managedBotConnectedMessage,
  resolveBotLocale,
} from "@/integrations/telegram/bot-messages";
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
  sendMessage: (chatId: string, text: string, replyMarkup?: TelegramReplyMarkup, parseMode?: "HTML") => Promise<void>;
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
      editMessageText: dependencies.editMessageText ?? (async (message, text, replyMarkup, parseMode) => {
        await dependencies.sendMessage(message.chatId, text, replyMarkup, parseMode);
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
      const locale = resolveBotLocale(membership);
      await dependencies.sendMessage(actor.chatId, managedBotConnectedMessage(locale, membership.business.name), {
        keyboard: [[{ text: botMessage(locale, "keyboardCreateCustomerBot") }], [{ text: botMessage(locale, "keyboardMainMenu") }]],
        resize_keyboard: true,
      });
    } catch {
      await dependencies.sendMessage(actor.chatId, botMessage("ru", "linkInvalidOrExpired"));
    }
    return;
  }

  if (botTokenPattern.test(text)) {
    let deleted = true;
    try {
      await dependencies.deleteMessage(actor.chatId, message.message_id);
    } catch {
      deleted = false;
    }
    await dependencies.sendMessage(actor.chatId, deleted
      ? botMessage("ru", "tokenRejectedDeleted")
      : botMessage("ru", "tokenRejectedNotDeleted"));
    return;
  }

  const loginUrl = `${requiredAppUrl()}/login`;
  const platformActor = await getPlatformTelegramActor(actor);
  if (platformActor) {
    const locale = resolveBotLocale(platformActor);
    if (text === botMessage(locale, "keyboardCreateCustomerBot")) {
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
      editMessageText: dependencies.editMessageText ?? (async (messageRef, messageText, replyMarkup, parseMode) => {
        await dependencies.sendMessage(messageRef.chatId, messageText, replyMarkup, parseMode);
        return messageRef;
      }),
      sendPhoto: dependencies.sendPhoto,
    });
    return;
  }
  await dependencies.sendMessage(actor.chatId, botMessage("ru", "loginPrompt"), {
    inline_keyboard: [[{ text: botMessage("ru", "loginButton"), url: loginUrl }]],
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
    await dependencies.sendMessage(actor?.destination.chatId ?? actor?.telegramUserId ?? "", botMessage(resolveBotLocale(actor), "managedBotCreationForbidden"));
    return;
  }
  const locale = resolveBotLocale(actor);
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
  await dependencies.sendMessage(actor.destination.chatId, botMessage(locale, "managedBotCreationPrompt"), {
    inline_keyboard: [[{ text: botMessage(locale, "keyboardCreateCustomerBot"), url: url.toString() }]],
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
  } catch (error) {
    if (error instanceof ManagedBotIntentBusyError) throw error;
    await dependencies.sendMessage(telegramUserId, botMessage("ru", "managedBotIntentMissing"));
    return;
  }
  const intentLocale = resolveBotLocale(intent.membership);
  if (intent.status === "COMPLETED") {
    await dependencies.sendMessage(telegramUserId, customerBotAlreadyConnectedMessage(intentLocale, update.bot.username));
    return;
  }
  try {
    const existing = await findConnectedBusinessTelegramBot(intent.businessId, botId);
    if (existing) {
      await completeManagedBotIntent(intent.id, botId, dependencies.now());
      await dependencies.sendMessage(telegramUserId, customerBotAlreadyConnectedMessage(intentLocale, existing.botUsername));
      return;
    }
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
    await dependencies.sendMessage(telegramUserId, managedBotConnectedFinalMessage(intentLocale, connected.botUsername));
  } catch {
    await failManagedBotIntent(intent.id, "CONNECTION_FAILED");
    await dependencies.sendMessage(telegramUserId, botMessage(intentLocale, "managedBotFailed"));
    throw new Error("Managed bot connection failed");
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
