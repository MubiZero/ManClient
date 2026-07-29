import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/webhooks/telegram/platform/route";
import {
  consumePlatformChatLink,
  createPlatformChatLink,
  getActivePlatformChatMembership,
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
      { update_id: 2, message: { message_id: 2, chat: { id: 20 }, text: "/start" } },
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

    await expect(consumePlatformChatLink(token, "30", now)).resolves.toMatchObject({
      id: fixture.membership.id,
    });
    await expect(consumePlatformChatLink(token, "30", now)).rejects.toThrow("invalid or expired");

    const expired = await createPlatformChatLink({
      membershipId: fixture.membership.id,
      actorUserId: fixture.user.id,
      expiresAt: new Date(now.getTime() + 15 * 60_000),
    });
    await expect(consumePlatformChatLink(expired, "30", new Date(now.getTime() + 16 * 60_000))).rejects.toThrow("invalid or expired");
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
      { update_id: 3, message: { message_id: 3, chat: { id: 40 }, text: `/start b_${token}` } },
      deps,
    );
    await handlePlatformTelegramUpdate(
      { update_id: 4, message: { message_id: 4, chat: { id: 40 }, text: "10009:customer-bot-secret" } },
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
      { update_id: 5, message: { message_id: 5, chat: { id: 50 }, text: "10010:customer-bot-secret" } },
      dependencies({
        deleted,
        connectBot: async (input) => { connections.push(input); return { botUsername: "never" }; },
      }),
    );

    expect(deleted).toEqual([5]);
    expect(connections).toEqual([]);
  });

  it("switches the active business when another membership link is consumed", async () => {
    const first = await createMembership("OWNER");
    const second = await createMembership("ADMIN");
    const now = new Date();
    const firstToken = await createPlatformChatLink({ membershipId: first.membership.id, actorUserId: first.user.id, expiresAt: new Date(now.getTime() + 15 * 60_000) });
    const secondToken = await createPlatformChatLink({ membershipId: second.membership.id, actorUserId: second.user.id, expiresAt: new Date(now.getTime() + 15 * 60_000) });

    await consumePlatformChatLink(firstToken, "60", now);
    await consumePlatformChatLink(secondToken, "60", now);

    await expect(getActivePlatformChatMembership("60")).resolves.toMatchObject({
      id: second.membership.id,
      businessId: second.business.id,
    });
  });

  async function createMembership(role: "OWNER" | "ADMIN") {
    const suffix = randomUUID();
    const business = await prisma.business.create({ data: { id: `platform-business-${suffix}`, name: "Platform Business", slug: `platform-${suffix}` } });
    businessIds.push(business.id);
    const user = await prisma.user.create({ data: { email: `platform-${suffix}@example.test`, displayName: "Business User" } });
    const membership = await prisma.membership.create({ data: { businessId: business.id, userId: user.id, role } });
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
