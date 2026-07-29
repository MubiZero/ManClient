import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import {
  handleConversationCommand,
  openConversation,
} from "@/core/conversations/conversation-engine";
import {
  consumeConversationAction,
  createConversationAction,
} from "@/core/conversations/conversation-actions";
import { prisma } from "@/core/database/prisma";

describe("durable conversation commands", () => {
  const businessIds: string[] = [];

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
  });

  it("allows only one concurrent command to advance a session version", async () => {
    const conversation = await createConversation();
    const results = await Promise.allSettled([
      handleConversationCommand({ businessId: conversation.businessId, conversationId: conversation.id, kind: "SELECT_LANGUAGE", payload: { locale: "ru" } }),
      handleConversationCommand({ businessId: conversation.businessId, conversationId: conversation.id, kind: "SELECT_LANGUAGE", payload: { locale: "tg" } }),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const session = await prisma.conversationSession.findFirstOrThrow({ where: { conversationId: conversation.id, active: true } });
    expect(session.version).toBe(1);
    expect(["ru", "tg"]).toContain((session.data as { locale: string }).locale);
  });

  it("consumes an opaque action once and rejects it after expiry", async () => {
    const conversation = await createConversation();
    const now = new Date();
    const action = await createConversationAction({
      businessId: conversation.businessId,
      conversationId: conversation.id,
      kind: "SELECT_LANGUAGE",
      payload: { locale: "ru" },
      expiresAt: new Date(now.getTime() + 60_000),
    });

    expect(action.id).not.toContain(conversation.businessId);
    await expect(consumeConversationAction({
      businessId: conversation.businessId,
      conversationId: conversation.id,
      actionId: action.id,
      now,
    })).resolves.toMatchObject({ kind: "SELECT_LANGUAGE", payload: { locale: "ru" } });
    await expect(consumeConversationAction({ businessId: conversation.businessId, conversationId: conversation.id, actionId: action.id, now })).rejects.toThrow("invalid or expired");

    const expired = await createConversationAction({
      businessId: conversation.businessId,
      conversationId: conversation.id,
      kind: "SELECT_LANGUAGE",
      payload: { locale: "tg" },
      expiresAt: new Date(now.getTime() + 1_000),
    });
    await expect(consumeConversationAction({ businessId: conversation.businessId, conversationId: conversation.id, actionId: expired.id, now: new Date(now.getTime() + 2_000) })).rejects.toThrow("invalid or expired");
  });

  async function createConversation() {
    const suffix = randomUUID();
    const business = await prisma.business.create({ data: { id: `conversation-business-${suffix}`, name: "Conversation Business", slug: `conversation-${suffix}` } });
    businessIds.push(business.id);
    return openConversation({
      businessId: business.id,
      channel: "TELEGRAM",
      externalChatId: `chat-${suffix}`,
      expiresAt: new Date(Date.now() + 30 * 60_000),
    });
  }
});
