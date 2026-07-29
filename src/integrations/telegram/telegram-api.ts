export type TelegramIdentity = {
  id: number;
  isBot: true;
  username: string;
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
  async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as {
      ok: boolean;
      result?: T;
      description?: string;
    };
    if (!response.ok || !payload.ok || payload.result === undefined) {
      throw new TelegramApiError(method, response.status, payload.description ?? "Unknown error");
    }
    return payload.result;
  }

  return {
    async getMe(): Promise<TelegramIdentity> {
      const identity = await call<{
        id: number;
        is_bot: boolean;
        username?: string;
      }>("getMe", {});
      if (!identity.is_bot || !identity.username) {
        throw new Error("Telegram bot must have a username");
      }
      return { id: identity.id, isBot: true, username: identity.username };
    },

    async setWebhook(url: string, secretToken: string): Promise<void> {
      await call<boolean>("setWebhook", { url, secret_token: secretToken, allowed_updates: ["message", "callback_query"] });
    },

    async deleteWebhook(): Promise<void> {
      await call<boolean>("deleteWebhook", {});
    },

    async sendMessage(chatId: string, text: string, replyMarkup?: TelegramReplyMarkup): Promise<void> {
      await call("sendMessage", { chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
    },

    async deleteMessage(chatId: string, messageId: number): Promise<void> {
      await call("deleteMessage", { chat_id: chatId, message_id: messageId });
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
