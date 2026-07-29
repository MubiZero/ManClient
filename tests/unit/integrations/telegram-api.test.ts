import { describe, expect, it } from "vitest";

import { createTelegramApi } from "@/integrations/telegram/telegram-api";

type RecordedCall = { method: string; body: unknown };

function recordingFetcher(calls: RecordedCall[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = new URL(String(input)).pathname.split("/").at(-1)!;
    const body = typeof init?.body === "string"
      ? JSON.parse(init.body)
      : init?.body;
    calls.push({ method, body });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

describe("Telegram API", () => {
  it("validates bot identity without exposing the token", async () => {
    const token = "123456:top-secret-token";
    const api = createTelegramApi(token, async () => new Response(JSON.stringify({
      ok: true,
      result: { id: 123456, is_bot: true, first_name: "Demo", username: "demo_business_bot" },
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await expect(api.getMe()).resolves.toEqual({
      id: 123456,
      isBot: true,
      username: "demo_business_bot",
    });
  });

  it("reports BotFather management capability", async () => {
    const api = createTelegramApi("123456:secret", async () => new Response(JSON.stringify({
      ok: true,
      result: { id: 123456, is_bot: true, username: "manclient_bot", can_manage_bots: true },
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await expect(api.getMe()).resolves.toMatchObject({ canManageBots: true });
  });

  it("gets a managed bot token by bot user id", async () => {
    const calls: RecordedCall[] = [];
    const api = createTelegramApi("123:manager-secret", (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        method: new URL(String(input)).pathname.split("/").at(-1)!,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
      });
      return new Response(JSON.stringify({ ok: true, result: "9001:managed-secret" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch);

    await expect(api.getManagedBotToken(9001)).resolves.toBe("9001:managed-secret");
    expect(calls).toEqual([{ method: "getManagedBotToken", body: { user_id: 9001 } }]);
  });

  it("redacts the platform token and bounds Telegram descriptions", async () => {
    const token = "123456:manager-secret";
    const api = createTelegramApi(token, async () => new Response(JSON.stringify({
      ok: false,
      description: `${token}-${"x".repeat(400)}`,
    }), { status: 400, headers: { "content-type": "application/json" } }));

    const error = await api.getManagedBotToken(9001).catch((caught: unknown) => caught);

    expect((error as Error).message).not.toContain(token);
    expect((error as Error).message.length).toBeLessThan(280);
  });

  it("returns a safe Telegram error without a token-bearing URL", async () => {
    const token = "123456:top-secret-token";
    const api = createTelegramApi(token, async () => new Response(JSON.stringify({
      ok: false,
      error_code: 401,
      description: "Unauthorized",
    }), { status: 401, headers: { "content-type": "application/json" } }));

    const error = await api.getMe().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Telegram getMe failed (401): Unauthorized");
    expect((error as Error).message).not.toContain(token);
    expect((error as Error).message).not.toContain("api.telegram.org");
  });

  it("rejects a non-bot account or bot without a username", async () => {
    const api = createTelegramApi("123456:token", async () => new Response(JSON.stringify({
      ok: true,
      result: { id: 123456, is_bot: true, first_name: "Nameless" },
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await expect(api.getMe()).rejects.toThrow("Telegram bot must have a username");
  });

  it("answers callbacks without leaking tokens", async () => {
    const calls: RecordedCall[] = [];
    const api = createTelegramApi("123:secret", recordingFetcher(calls));

    await api.answerCallbackQuery("callback-1", "Готово");

    expect(calls).toContainEqual({
      method: "answerCallbackQuery",
      body: { callback_query_id: "callback-1", text: "Готово" },
    });
    expect(JSON.stringify(calls)).not.toContain("123:secret");
  });

  it("edits a message by its Telegram reference and preserves its keyboard", async () => {
    const calls: RecordedCall[] = [];
    const api = createTelegramApi("123:secret", recordingFetcher(calls));
    const keyboard = { inline_keyboard: [[{ text: "Открыть", callback_data: "act_7Yp" }]] };

    await expect(api.editMessageText({ chatId: "-10088", messageId: 17 }, "Обновлено", keyboard)).resolves.toEqual({
      chatId: "-10088",
      messageId: 42,
    });

    expect(calls).toContainEqual({
      method: "editMessageText",
      body: { chat_id: "-10088", message_id: 17, text: "Обновлено", reply_markup: keyboard },
    });
  });

  it("edits reply markup by its Telegram reference without exposing the token", async () => {
    const calls: RecordedCall[] = [];
    const token = "123:secret";
    const api = createTelegramApi(token, recordingFetcher(calls));
    const keyboard = { inline_keyboard: [[{ text: "Назад", callback_data: "act_back_7Yp" }]] };

    await expect(api.editMessageReplyMarkup({ chatId: "-10088", messageId: 17 }, keyboard)).resolves.toEqual({
      chatId: "-10088",
      messageId: 42,
    });

    expect(calls).toContainEqual({
      method: "editMessageReplyMarkup",
      body: { chat_id: "-10088", message_id: 17, reply_markup: keyboard },
    });
    expect(JSON.stringify(calls)).not.toContain(token);
  });

  it("sends either a protected photo URL or stored bytes and returns a message reference", async () => {
    const calls: RecordedCall[] = [];
    const api = createTelegramApi("123:secret", recordingFetcher(calls));

    await expect(api.sendPhoto("-10088", "https://storage.example/receipt?signature=protected", "Чек")).resolves.toEqual({
      chatId: "-10088",
      messageId: 42,
    });
    await api.sendPhoto("-10088", new Uint8Array([1, 2, 3]), "Чек");

    expect(calls[0]).toEqual({
      method: "sendPhoto",
      body: { chat_id: "-10088", photo: "https://storage.example/receipt?signature=protected", caption: "Чек" },
    });
    expect(calls[1]?.method).toBe("sendPhoto");
    expect(calls[1]?.body).toBeInstanceOf(FormData);
    expect((calls[1]?.body as FormData).get("chat_id")).toBe("-10088");
    expect((calls[1]?.body as FormData).get("caption")).toBe("Чек");
    expect((calls[1]?.body as FormData).get("photo")).toBeInstanceOf(Blob);
  });

  it("registers the native command list", async () => {
    const calls: RecordedCall[] = [];
    const api = createTelegramApi("123:secret", recordingFetcher(calls));

    await api.setMyCommands([{ command: "menu", description: "Главное меню" }]);

    expect(calls).toContainEqual({
      method: "setMyCommands",
      body: { commands: [{ command: "menu", description: "Главное меню" }] },
    });
  });
});
