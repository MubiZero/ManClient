import { afterEach, describe, expect, it, vi } from "vitest";

import { getPlatformTelegramCapability } from "@/core/integrations/platform-telegram-capability";

describe("platform Telegram capability", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_USERNAME;
  });

  it("enables managed setup only for the configured manager bot", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "2:secret";
    process.env.TELEGRAM_BOT_USERNAME = "@manclient_bot";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      result: { id: 1, is_bot: true, username: "manclient_bot", can_manage_bots: true },
    }), { status: 200 })));

    await expect(getPlatformTelegramCapability()).resolves.toEqual({ managedBotsAvailable: true });
  });

  it("disables managed setup when Management Mode is off", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "1:secret";
    process.env.TELEGRAM_BOT_USERNAME = "manclient_bot";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      result: { id: 1, is_bot: true, username: "manclient_bot", can_manage_bots: false },
    }), { status: 200 })));

    await expect(getPlatformTelegramCapability()).resolves.toEqual({ managedBotsAvailable: false });
  });
});
