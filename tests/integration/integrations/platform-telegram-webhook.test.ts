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
import { handlePlatformTelegramUpdate } from "@/integrations/telegram/platform-update-handler";

describe("ManClient business assistant", () => {
  const businessIds: string[] = [];

  beforeEach(() => {
    process.env.PLATFORM_LINK_SECRET = "platform-link-test-secret-at-least-32-bytes";
    process.env.TELEGRAM_WEBHOOK_SECRET = "platform-webhook-secret";
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
    const callback = (telegramUserId: number) => handlePlatformTelegramUpdate({
      update_id: telegramUserId,
      callback_query: {
        from: { id: telegramUserId },
        message: { message_id: 44, chat: { id: -10044, type: "supergroup" } },
        data: "business.noop",
      },
    }, dependencies({ messages }));

    await callback(7005);
    expect(messages).toEqual([]);

    await callback(7004);
    expect(messages).toEqual([{ text: "Действие пока недоступно. Откройте кабинет ManClient.", url: "https://manclient.example/login" }]);
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

  it("connects a customer bot only for a linked owner and deletes the token message", async () => {
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
    expect(connections).toEqual([{
      businessId: fixture.business.id,
      actorUserId: fixture.user.id,
      token: "10009:customer-bot-secret",
    }]);
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
  now?: () => Date;
  connectBot?: (input: { businessId: string; actorUserId: string; token: string }) => Promise<{ botUsername: string }>;
} = {}) {
  return {
    now: overrides.now ?? (() => new Date("2026-07-29T06:00:00.000Z")),
    sendMessage: async (_chatId: string, text: string, replyMarkup?: { inline_keyboard: Array<Array<{ url?: string }>> }) => {
      overrides.messages?.push({ text, url: replyMarkup?.inline_keyboard[0]?.[0]?.url });
    },
    deleteMessage: async (_chatId: string, messageId: number) => { overrides.deleted?.push(messageId); },
    connectBot: overrides.connectBot ?? (async () => ({ botUsername: "tenant_bot" })),
  };
}
