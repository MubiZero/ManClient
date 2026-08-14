export function escapeTelegramHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export type TelegramIdentity = {
  id: number;
  isBot: true;
  username: string;
  canManageBots?: boolean;
};

export type TelegramInlineKeyboard = {
  inline_keyboard: Array<Array<{ text: string; url?: string; callback_data?: string }>>;
};

export type TelegramReplyKeyboard = {
  keyboard: Array<Array<{ text: string; request_contact?: boolean }>>;
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
};

export type TelegramReplyMarkup = TelegramInlineKeyboard | TelegramReplyKeyboard;

export type TelegramMessageRef = {
  chatId: string;
  messageId: number;
};

export type TelegramBotCommand = {
  command: string;
  description: string;
};

export class TelegramApiError extends Error {
  constructor(
    public readonly method: string,
    public readonly status: number,
    description: string,
  ) {
    super(`Telegram ${method} failed (${status}): ${description}`);
    this.name = "TelegramApiError";
  }
}

export type TelegramApi = ReturnType<typeof createTelegramApi>;

export function createTelegramApi(token: string, fetcher: typeof fetch = fetch) {
  async function request<T>(method: string, body: BodyInit, headers?: HeadersInit): Promise<T> {
    const response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      ...(headers ? { headers } : {}),
      body,
    });
    const payload = (await response.json()) as {
      ok: boolean;
      result?: T;
      description?: string;
    };
    if (!response.ok || !payload.ok || payload.result === undefined) {
      const description = (payload.description ?? "Unknown error").replaceAll(token, "[redacted]").slice(0, 200);
      throw new TelegramApiError(method, response.status, description);
    }
    return payload.result;
  }

  async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    return request<T>(method, JSON.stringify(body), { "content-type": "application/json" });
  }

  async function messageRef(chatId: string, method: string, body: Record<string, unknown>): Promise<TelegramMessageRef> {
    const message = await call<{ message_id?: number }>(method, body);
    if (typeof message.message_id !== "number") {
      throw new Error(`Telegram ${method} did not return a message id`);
    }
    return { chatId, messageId: message.message_id };
  }

  async function multipartMessageRef(chatId: string, method: string, form: FormData): Promise<TelegramMessageRef> {
    const message = await request<{ message_id?: number }>(method, form);
    if (typeof message.message_id !== "number") {
      throw new Error(`Telegram ${method} did not return a message id`);
    }
    return { chatId, messageId: message.message_id };
  }

  return {
    async getMe(): Promise<TelegramIdentity> {
      const identity = await call<{
        id: number;
        is_bot: boolean;
        username?: string;
        can_manage_bots?: boolean;
      }>("getMe", {});
      if (!identity.is_bot || !identity.username) {
        throw new Error("Telegram bot must have a username");
      }
      return {
        id: identity.id,
        isBot: true,
        username: identity.username,
        ...(identity.can_manage_bots !== undefined ? { canManageBots: identity.can_manage_bots } : {}),
      };
    },

    async getManagedBotToken(userId: number): Promise<string> {
      const managedToken = await call<string>("getManagedBotToken", { user_id: userId });
      if (!/^\d+:[A-Za-z0-9_-]+$/.test(managedToken)) {
        throw new Error("Telegram did not return a valid managed bot token");
      }
      return managedToken;
    },

    async setWebhook(url: string, secretToken: string): Promise<void> {
      await call<boolean>("setWebhook", { url, secret_token: secretToken, allowed_updates: ["message", "callback_query"] });
    },

    async deleteWebhook(): Promise<void> {
      await call<boolean>("deleteWebhook", {});
    },

    async sendMessage(chatId: string, text: string, replyMarkup?: TelegramReplyMarkup, parseMode?: "HTML"): Promise<void> {
      await call("sendMessage", { chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}), ...(parseMode ? { parse_mode: parseMode } : {}) });
    },

    async deleteMessage(chatId: string, messageId: number): Promise<void> {
      await call("deleteMessage", { chat_id: chatId, message_id: messageId });
    },

    async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
      await call("answerCallbackQuery", { callback_query_id: callbackQueryId, ...(text ? { text } : {}) });
    },

    async editMessageText(message: TelegramMessageRef, text: string, replyMarkup?: TelegramReplyMarkup, parseMode?: "HTML"): Promise<TelegramMessageRef> {
      return messageRef(message.chatId, "editMessageText", {
        chat_id: message.chatId,
        message_id: message.messageId,
        text,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        ...(parseMode ? { parse_mode: parseMode } : {}),
      });
    },

    async editMessageReplyMarkup(message: TelegramMessageRef, replyMarkup?: TelegramReplyMarkup): Promise<TelegramMessageRef> {
      return messageRef(message.chatId, "editMessageReplyMarkup", {
        chat_id: message.chatId,
        message_id: message.messageId,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    },

    async sendPhoto(chatId: string, photo: Uint8Array | string, caption?: string, replyMarkup?: TelegramReplyMarkup, parseMode?: "HTML"): Promise<TelegramMessageRef> {
      if (typeof photo === "string") {
        return messageRef(chatId, "sendPhoto", {
          chat_id: chatId,
          photo,
          ...(caption ? { caption } : {}),
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
          ...(parseMode ? { parse_mode: parseMode } : {}),
        });
      }

      const form = new FormData();
      form.append("chat_id", chatId);
      const photoBytes = new Uint8Array(photo.byteLength);
      photoBytes.set(photo);
      form.append("photo", new Blob([photoBytes.buffer]), "photo.jpg");
      if (caption) form.append("caption", caption);
      if (replyMarkup) form.append("reply_markup", JSON.stringify(replyMarkup));
      if (parseMode) form.append("parse_mode", parseMode);
      return multipartMessageRef(chatId, "sendPhoto", form);
    },

    /** Without `languageCode` Telegram stores the set as the fallback shown to every other language. */
    async setMyCommands(commands: TelegramBotCommand[], languageCode?: string): Promise<void> {
      await call("setMyCommands", languageCode ? { commands, language_code: languageCode } : { commands });
    },

    async getFile(fileId: string): Promise<{ filePath: string }> {
      const file = await call<{ file_path?: string }>("getFile", { file_id: fileId });
      if (!file.file_path) throw new Error("Telegram did not return a file path");
      return { filePath: file.file_path };
    },

    async downloadFile(filePath: string): Promise<Uint8Array> {
      const response = await fetcher(`https://api.telegram.org/file/bot${token}/${filePath}`);
      if (!response.ok) {
        throw new TelegramApiError("downloadFile", response.status, "File download failed");
      }
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}
