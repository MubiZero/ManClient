import { describe, expect, it } from "vitest";

import { createTelegramApi } from "@/integrations/telegram/telegram-api";

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
});
