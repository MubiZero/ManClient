import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/webhooks/telegram/platform/route";
import {
  consumePlatformChatLink,
  createPlatformChatLink,
  getPlatformTelegramActor,
  listBusinessTelegramDestinations,
} from "@/core/integrations/platform-chat-link";
import { prisma } from "@/core/database/prisma";
import { createManagedBotIntent } from "@/core/integrations/managed-bot-intent";
import { handlePlatformTelegramUpdate } from "@/integrations/telegram/platform-update-handler";
import type { TelegramReplyMarkup } from "@/integrations/telegram/telegram-api";

describe("ManClient business assistant", () => {
  const businessIds: string[] = [];

  beforeEach(() => {
    process.env.PLATFORM_LINK_SECRET = "platform-link-test-secret-at-least-32-bytes";
    process.env.TELEGRAM_WEBHOOK_SECRET = "platform-webhook-secret";
    process.env.TELEGRAM_BOT_USERNAME = "manclient_bot";
    process.env.APP_URL = "https://manclient.example";
  });

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    delete process.env.PLATFORM_LINK_SECRET;
  });

  it("rejects a platform webhook without its secret", async () => {
    const response = await POST(new Request("http://localhost/api/webhooks/telegram/platform", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ update_id: 1, message: { message_id: 1, chat: { id: 10 }, text: "/start" } }),
    }));

    expect(response.status).toBe(401);
  });

  it("welcomes an unlinked business without customer receipt copy", async () => {
    const messages: Array<{ text: string; url?: string }> = [];

    await handlePlatformTelegramUpdate(
      { update_id: 2, message: { message_id: 2, from: { id: 20 }, chat: { id: 20, type: "private" }, text: "/start" } },
      dependencies({ messages }),
    );

    expect(messages[0].text).toContain("бизнес");
    expect(messages[0].text).not.toContain("чек");
    expect(messages[0].text).not.toContain("клиент");
    expect(messages[0].url).toBe("https://manclient.example/login");
  });

  it("consumes a signed membership link once and rechecks its expiry", async () => {
    const fixture = await createMembership("OWNER");
    const now = new Date();
    const token = await createPlatformChatLink({
      membershipId: fixture.membership.id,
      actorUserId: fixture.user.id,
      expiresAt: new Date(now.getTime() + 15 * 60_000),
    });

    await expect(consumePlatformChatLink(token, { chatId: "30", chatType: "private", telegramUserId: "30" }, now)).resolves.toMatchObject({
      id: fixture.membership.id,
    });
    await expect(consumePlatformChatLink(token, { chatId: "30", chatType: "private", telegramUserId: "30" }, now)).rejects.toThrow("invalid or expired");

    const expired = await createPlatformChatLink({
      membershipId: fixture.membership.id,
      actorUserId: fixture.user.id,
      expiresAt: new Date(now.getTime() + 15 * 60_000),
    });
    await expect(consumePlatformChatLink(expired, { chatId: "30", chatType: "private", telegramUserId: "30" }, new Date(now.getTime() + 16 * 60_000))).rejects.toThrow("invalid or expired");
  });

  it("authorizes a group callback only for a linked Telegram identity", async () => {
    const fixture = await createMembership("OWNER");
    const now = new Date();
    const token = await createPlatformChatLink({
      membershipId: fixture.membership.id,
      actorUserId: fixture.user.id,
      expiresAt: new Date(now.getTime() + 15 * 60_000),
    });

    await consumePlatformChatLink(token, {
      chatId: "-10042",
      chatType: "supergroup",
      telegramUserId: "7001",
    }, now);

    await expect(getPlatformTelegramActor({ chatId: "-10042", telegramUserId: "7001" }))
      .resolves.toMatchObject({ membershipId: fixture.membership.id, businessId: fixture.business.id, role: "OWNER" });
    await expect(getPlatformTelegramActor({ chatId: "-10042", telegramUserId: "7002" })).resolves.toBeNull();
  });

  it("routes a group callback only for the Telegram user who linked its destination", async () => {
    const fixture = await createMembership("OWNER");
    const now = new Date();
    const token = await createPlatformChatLink({
      membershipId: fixture.membership.id,
      actorUserId: fixture.user.id,
      expiresAt: new Date(now.getTime() + 15 * 60_000),
    });
    await consumePlatformChatLink(token, {
      chatId: "-10044",
      chatType: "supergroup",
      telegramUserId: "7004",
    }, now);
    const messages: Array<{ text: string; url?: string }> = [];
    const answered: string[] = [];
    const callback = (telegramUserId: number) => handlePlatformTelegramUpdate({
      update_id: telegramUserId,
      callback_query: {
        id: String(telegramUserId),
        from: { id: telegramUserId },
        message: { message_id: 44, chat: { id: -10044, type: "supergroup" } },
        data: "business.noop",
      },
    }, dependencies({ messages, answered }));

    await callback(7005);
    expect(messages).toEqual([]);
    expect(answered).toEqual(["7005"]);

    await callback(7004);
    expect(answered).toEqual(["7005", "7004"]);
    expect(messages).toEqual([{
      text: "Это действие уже недействительно. Обновите данные или откройте актуальное меню.",
      url: undefined,
    }]);
  });

  it("rejects an unknown Telegram chat type with the generic link error", async () => {
    const fixture = await createMembership("OWNER");
    const now = new Date();
    const token = await createPlatformChatLink({
      membershipId: fixture.membership.id,
      actorUserId: fixture.user.id,
      expiresAt: new Date(now.getTime() + 15 * 60_000),
    });

    await expect(consumePlatformChatLink(token, {
      chatId: "7006",
      chatType: "forum" as never,
      telegramUserId: "7006",
    }, now)).rejects.toThrow("invalid or expired");
  });

  it("rejects a shared destination for staff while allowing their private identity", async () => {
    const fixture = await createStaffMembership();
    const now = new Date();
    const groupToken = await createPlatformChatLink({
      membershipId: fixture.membership.id,
      actorUserId: fixture.user.id,
      expiresAt: new Date(now.getTime() + 15 * 60_000),
    });
    const privateToken = await createPlatformChatLink({
      membershipId: fixture.membership.id,
      actorUserId: fixture.user.id,
      expiresAt: new Date(now.getTime() + 15 * 60_000),
    });

    await expect(consumePlatformChatLink(groupToken, {
      chatId: "-10043",
      chatType: "group",
      telegramUserId: "7003",
    }, now)).rejects.toThrow("invalid or expired");
    await expect(consumePlatformChatLink(privateToken, {
      chatId: "7003",
      chatType: "private",
      telegramUserId: "7003",
    }, now)).resolves.toMatchObject({ id: fixture.membership.id });
  });

  it("deletes bot tokens sent to chat and never uses them", async () => {
    const fixture = await createMembership("OWNER");
    const now = new Date();
    const token = await createPlatformChatLink({
      membershipId: fixture.membership.id,
      actorUserId: fixture.user.id,
      expiresAt: new Date(now.getTime() + 15 * 60_000),
    });
    const deleted: number[] = [];
    const connections: Array<{ businessId: string; actorUserId: string; token: string }> = [];
    const deps = dependencies({
      deleted,
      connectBot: async (input) => {
        connections.push(input);
        return { botUsername: "tenant_bot" };
      },
      now: () => now,
    });

    await handlePlatformTelegramUpdate(
      { update_id: 3, message: { message_id: 3, from: { id: 40 }, chat: { id: 40, type: "private" }, text: `/start b_${token}` } },
      deps,
    );
    await handlePlatformTelegramUpdate(
      { update_id: 4, message: { message_id: 4, from: { id: 40 }, chat: { id: 40, type: "private" }, text: "10009:customer-bot-secret" } },
      deps,
    );

    expect(deleted).toEqual([4]);
    expect(connections).toEqual([]);
  });

  it("does not accept a bot token from an unlinked chat", async () => {
    const connections: unknown[] = [];
    const deleted: number[] = [];

    await handlePlatformTelegramUpdate(
      { update_id: 5, message: { message_id: 5, from: { id: 50 }, chat: { id: 50, type: "private" }, text: "10010:customer-bot-secret" } },
      dependencies({
        deleted,
        connectBot: async (input) => { connections.push(input); return { botUsername: "never" }; },
      }),
    );

    expect(deleted).toEqual([5]);
    expect(connections).toEqual([]);
  });

  it("fails closed when Telegram cannot delete a token message", async () => {
    const connections: unknown[] = [];
    const messages: Array<{ text: string }> = [];
    const deps = dependencies({
      messages,
      connectBot: async (input) => { connections.push(input); return { botUsername: "never" }; },
    });
    deps.deleteMessage = async () => { throw new Error("forbidden"); };

    await handlePlatformTelegramUpdate(
      { update_id: 6, message: { message_id: 6, from: { id: 60 }, chat: { id: 60, type: "private" }, text: "10011:exposed-secret" } },
      deps,
    );

    expect(connections).toEqual([]);
    expect(messages.at(-1)?.text).toContain("перевыпустите токен");
    expect(JSON.stringify(messages)).not.toContain("exposed-secret");
  });

  it("replaces a chat destination when another membership links it", async () => {
    const first = await createMembership("OWNER");
    const second = await createMembership("ADMIN");
    const now = new Date();
    const firstToken = await createPlatformChatLink({ membershipId: first.membership.id, actorUserId: first.user.id, expiresAt: new Date(now.getTime() + 15 * 60_000) });
    const secondToken = await createPlatformChatLink({ membershipId: second.membership.id, actorUserId: second.user.id, expiresAt: new Date(now.getTime() + 15 * 60_000) });

    await consumePlatformChatLink(firstToken, { chatId: "60", chatType: "private", telegramUserId: "60" }, now);
    await consumePlatformChatLink(secondToken, { chatId: "60", chatType: "private", telegramUserId: "60" }, now);

    await expect(listBusinessTelegramDestinations(first.business.id)).resolves.toEqual([]);
    await expect(listBusinessTelegramDestinations(second.business.id)).resolves.toMatchObject([{
      chatId: "60",
      chatType: "private",
      membershipId: second.membership.id,
    }]);
  });

  it("creates and connects a customer-owned managed bot without asking for a token", async () => {
    const fixture = await createMembership("OWNER");
    const now = new Date();
    const link = await createPlatformChatLink({
      membershipId: fixture.membership.id,
      actorUserId: fixture.user.id,
      expiresAt: new Date(now.getTime() + 15 * 60_000),
    });
    const messages: Array<{ text: string; url?: string }> = [];
    const connections: Array<Record<string, unknown>> = [];
    const deps = dependencies({
      messages,
      now: () => now,
      getManagedBotToken: async (botId) => {
        expect(botId).toBe(9001);
        return "9001:managed-customer-secret";
      },
      connectBot: async (input) => {
        connections.push(input);
        return { botUsername: "platform_business_bot" };
      },
    });

    await handlePlatformTelegramUpdate({
      update_id: 70,
      message: { message_id: 70, from: { id: 7007 }, chat: { id: 7007, type: "private" }, text: `/start b_${link}` },
    }, deps);
    await handlePlatformTelegramUpdate({
      update_id: 71,
      message: { message_id: 71, from: { id: 7007 }, chat: { id: 7007, type: "private" }, text: "Создать клиентского бота" },
    }, deps);

    expect(messages.at(-1)?.url).toMatch(/^https:\/\/t\.me\/newbot\/manclient_bot\/platform_business_bot\?name=/);
    expect(messages.at(-1)?.text).toContain("принадлежать вам");

    await handlePlatformTelegramUpdate({
      update_id: 72,
      managed_bot: {
        user: { id: 7007 },
        bot: { id: 9001, is_bot: true, username: "platform_business_bot" },
      },
    }, deps);

    expect(connections).toEqual([{
      businessId: fixture.business.id,
      actorUserId: fixture.user.id,
      token: "9001:managed-customer-secret",
      connectionMethod: "MANAGED",
      managedOwnerTelegramUserId: "7007",
      expectedBotId: "9001",
    }]);
    expect(messages.at(-1)?.text).toContain("@platform_business_bot подключён");
    expect(JSON.stringify(messages)).not.toContain("managed-customer-secret");
  });

  it("returns a failed managed connection to pending and succeeds on retry", async () => {
    const fixture = await createMembership("OWNER");
    const now = new Date();
    const link = await createPlatformChatLink({
      membershipId: fixture.membership.id,
      actorUserId: fixture.user.id,
      expiresAt: new Date(now.getTime() + 15 * 60_000),
    });
    let tokenAttempts = 0;
    const connections: Array<Record<string, unknown>> = [];
    const deps = dependencies({
      now: () => now,
      getManagedBotToken: async () => {
        tokenAttempts += 1;
        if (tokenAttempts === 1) throw new Error("Telegram unavailable");
        return "9010:retry-secret";
      },
      connectBot: async input => { connections.push(input); return { botUsername: "retry_bot" }; },
    });
    await handlePlatformTelegramUpdate({
      update_id: 80,
      message: { message_id: 80, from: { id: 7010 }, chat: { id: 7010, type: "private" }, text: `/start b_${link}` },
    }, deps);
    await handlePlatformTelegramUpdate({
      update_id: 81,
      message: { message_id: 81, from: { id: 7010 }, chat: { id: 7010, type: "private" }, text: "Создать клиентского бота" },
    }, deps);
    const managedUpdate = {
      update_id: 82,
      managed_bot: { user: { id: 7010 }, bot: { id: 9010, is_bot: true as const, username: "retry_bot" } },
    };

    await expect(handlePlatformTelegramUpdate(managedUpdate, deps)).rejects.toThrow("connection failed");
    await expect(prisma.managedBotConnectionIntent.findFirstOrThrow({ where: { businessId: fixture.business.id } }))
      .resolves.toMatchObject({ status: "PENDING", botId: null, lastErrorCode: "CONNECTION_FAILED" });

    await expect(handlePlatformTelegramUpdate(managedUpdate, deps)).resolves.toBeUndefined();
    expect(connections).toHaveLength(1);
    await expect(prisma.managedBotConnectionIntent.findFirstOrThrow({ where: { businessId: fixture.business.id } }))
      .resolves.toMatchObject({ status: "COMPLETED", botId: "9010" });
  });

  it("completes the intent when the bot was connected before finalization", async () => {
    const fixture = await createMembership("OWNER");
    const now = new Date("2026-07-30T10:00:00.000Z");
    await prisma.businessTelegramIdentity.create({
      data: { membershipId: fixture.membership.id, telegramUserId: "7011" },
    });
    await createManagedBotIntent({
      membershipId: fixture.membership.id,
      businessId: fixture.business.id,
      userId: fixture.user.id,
      role: "OWNER",
      telegramUserId: "7011",
    }, { displayName: "Recovered", suggestedUsername: "recovered_customer_bot" }, now);
    await prisma.businessTelegramIntegration.create({
      data: {
        businessId: fixture.business.id,
        publicId: `recovered-${fixture.business.id}`,
        botId: "9011",
        botUsername: "recovered_customer_bot",
        status: "ACTIVE",
        connectionMethod: "MANAGED",
        managedOwnerTelegramUserId: "7011",
        managedAt: now,
        connectedByUserId: fixture.user.id,
        connectedAt: now,
      },
    });
    let exported = false;

    await handlePlatformTelegramUpdate({
      update_id: 83,
      managed_bot: { user: { id: 7011 }, bot: { id: 9011, is_bot: true, username: "recovered_customer_bot" } },
    }, dependencies({ getManagedBotToken: async () => { exported = true; return "9011:unused"; }, now: () => now }));

    expect(exported).toBe(false);
    await expect(prisma.managedBotConnectionIntent.findFirstOrThrow({ where: { businessId: fixture.business.id } }))
      .resolves.toMatchObject({ status: "COMPLETED", botId: "9011" });
  });

  async function createMembership(role: "OWNER" | "ADMIN") {
    const suffix = randomUUID();
    const business = await prisma.business.create({ data: { id: `platform-business-${suffix}`, name: "Platform Business", slug: `platform-${suffix}` } });
    businessIds.push(business.id);
    const user = await prisma.user.create({ data: { email: `platform-${suffix}@example.test`, displayName: "Business User" } });
    const membership = await prisma.membership.create({ data: { businessId: business.id, userId: user.id, role } });
    return { business, user, membership };
  }

  async function createStaffMembership() {
    const suffix = randomUUID();
    const business = await prisma.business.create({ data: { id: `platform-business-${suffix}`, name: "Platform Business", slug: `platform-${suffix}` } });
    businessIds.push(business.id);
    const user = await prisma.user.create({ data: { email: `platform-${suffix}@example.test`, displayName: "Business Staff" } });
    const membership = await prisma.membership.create({ data: { businessId: business.id, userId: user.id, role: "STAFF" } });
    return { business, user, membership };
  }
});

function dependencies(overrides: {
  messages?: Array<{ text: string; url?: string }>;
  deleted?: number[];
  answered?: string[];
  now?: () => Date;
  connectBot?: (input: {
    businessId: string;
    actorUserId: string;
    token: string;
    connectionMethod?: "TOKEN" | "MANAGED";
    managedOwnerTelegramUserId?: string;
    expectedBotId?: string;
  }) => Promise<{ botUsername: string }>;
  getManagedBotToken?: (botId: number) => Promise<string>;
} = {}) {
  return {
    now: overrides.now ?? (() => new Date("2026-07-29T06:00:00.000Z")),
    sendMessage: async (_chatId: string, text: string, replyMarkup?: TelegramReplyMarkup) => {
      const url = replyMarkup && "inline_keyboard" in replyMarkup
        ? replyMarkup.inline_keyboard[0]?.[0]?.url
        : undefined;
      overrides.messages?.push({ text, url });
    },
    deleteMessage: async (_chatId: string, messageId: number) => { overrides.deleted?.push(messageId); },
    answerCallbackQuery: async (callbackId: string) => { overrides.answered?.push(callbackId); },
    connectBot: overrides.connectBot ?? (async () => ({ botUsername: "tenant_bot" })),
    getManagedBotToken: overrides.getManagedBotToken ?? (async () => "9001:managed-token"),
  };
}
