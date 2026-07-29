import type { ConversationChannel, Prisma } from "@/generated/prisma/client";

import { prisma } from "@/core/database/prisma";
import {
  conversationStates,
  transitionConversationState,
  type ConversationCommand,
  type ConversationData,
  type ConversationLocale,
  type ConversationStateName,
} from "@/core/conversations/conversation-state";
import { messagesRu } from "@/core/conversations/messages.ru";
import { messagesTg } from "@/core/conversations/messages.tg";

type OpenConversationInput = {
  businessId: string;
  integrationId?: string;
  channel: ConversationChannel;
  externalChatId: string;
  expiresAt: Date;
};

type HandleCommandInput = ConversationCommand & {
  businessId: string;
  conversationId: string;
};

export type ConversationReply = { text: string; state: ConversationStateName };

export async function openConversation(input: OpenConversationInput) {
  const conversation = await prisma.conversation.upsert({
    where: {
      businessId_channel_externalChatId: {
        businessId: input.businessId,
        channel: input.channel,
        externalChatId: input.externalChatId,
      },
    },
    create: {
      businessId: input.businessId,
      integrationId: input.integrationId,
      channel: input.channel,
      externalChatId: input.externalChatId,
      sessions: {
        create: { state: "LANGUAGE", data: {}, expiresAt: input.expiresAt },
      },
    },
    update: { integrationId: input.integrationId, status: "ACTIVE" },
  });
  const activeSession = await prisma.conversationSession.findFirst({
    where: { conversationId: conversation.id, active: true },
  });
  if (!activeSession) {
    await prisma.conversationSession.create({
      data: { conversationId: conversation.id, state: "LANGUAGE", data: {}, expiresAt: input.expiresAt },
    });
  }
  return conversation;
}

export async function handleConversationCommand(
  input: HandleCommandInput,
  now = new Date(),
): Promise<ConversationReply> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, businessId: input.businessId },
    select: { id: true },
  });
  if (!conversation) throw new Error("Conversation does not exist");
  const session = await prisma.conversationSession.findFirst({
    where: { conversationId: conversation.id, active: true },
  });
  if (!session || session.expiresAt <= now || !isState(session.state)) {
    throw new Error("Conversation session is expired");
  }

  const next = transitionConversationState({
    state: session.state,
    data: session.data as ConversationData,
  }, input);
  const updated = await prisma.conversationSession.updateMany({
    where: { id: session.id, active: true, version: session.version },
    data: {
      state: next.state,
      data: next.data as Prisma.InputJsonObject,
      version: { increment: 1 },
    },
  });
  if (updated.count !== 1) throw new Error("Conversation was updated concurrently");

  return {
    state: next.state,
    text: conversationMessage(next.data.locale ?? "ru", next.state),
  };
}

export function conversationMessage(locale: ConversationLocale, state: ConversationStateName) {
  return (locale === "tg" ? messagesTg : messagesRu)[state];
}

function isState(value: string): value is ConversationStateName {
  return (conversationStates as readonly string[]).includes(value);
}
