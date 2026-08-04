import type { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/core/database/prisma";
import { isUniqueConstraintError } from "@/core/database/prisma-errors";

export type BusinessBotActionActor = {
  businessId: string;
  userId: string;
  telegramUserId: string;
  destination: { chatId: string };
};

type CreateBusinessBotActionInput = {
  kind: string;
  payload?: Prisma.InputJsonObject;
  expiresAt: Date;
  mode?: "NAVIGATION" | "MUTATION";
};

export type BusinessBotActionKind =
  | "menu.open"
  | "bookings.list"
  | "booking.open"
  | "payments.list"
  | "payment.open"
  | "PAYMENT_REFRESH"
  | "PAYMENT_RECEIPT"
  | "PAYMENT_APPROVE_BEGIN"
  | "PAYMENT_APPROVE_CONFIRM"
  | "PAYMENT_REJECT_BEGIN"
  | "PAYMENT_REJECT_REASON"
  | "BOOKING_CONFIRM"
  | "BOOKING_REMIND_PAYMENT"
  | "BOOKING_RESCHEDULE_DATE"
  | "BOOKING_RESCHEDULE_SLOT"
  | "BOOKING_CANCEL_BEGIN"
  | "BOOKING_CANCEL_REASON"
  | "BOOKING_REFRESH"
  | "SET_LANGUAGE";

type StoredActionPayload = {
  actorUserId: string;
  telegramUserId: string;
  mode: "NAVIGATION" | "MUTATION";
  data: Prisma.JsonObject;
};

export async function createBusinessBotAction(
  actor: BusinessBotActionActor,
  input: CreateBusinessBotActionInput,
) {
  const conversation = await getOrCreateConversation(actor);
  const action = await prisma.conversationAction.create({
    data: {
      businessId: actor.businessId,
      conversationId: conversation.id,
      kind: input.kind,
      payload: {
        actorUserId: actor.userId,
        telegramUserId: actor.telegramUserId,
        mode: input.mode ?? "NAVIGATION",
        data: input.payload ?? {},
      },
      expiresAt: input.expiresAt,
    },
    select: { id: true, expiresAt: true },
  });
  return { actionId: action.id, expiresAt: action.expiresAt };
}

async function getOrCreateConversation(actor: BusinessBotActionActor) {
  const where = {
    businessId_channel_externalChatId: {
      businessId: actor.businessId,
      channel: "TELEGRAM" as const,
      externalChatId: conversationKey(actor),
    },
  };
  try {
    return await prisma.conversation.upsert({
      where,
      create: {
        businessId: actor.businessId,
        channel: "TELEGRAM",
        externalChatId: conversationKey(actor),
      },
      update: {},
      select: { id: true },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    return prisma.conversation.findUniqueOrThrow({ where, select: { id: true } });
  }
}

export async function consumeBusinessBotAction(
  actor: BusinessBotActionActor,
  actionId: string,
  now = new Date(),
) {
  return prisma.$transaction(async (transaction) => {
    const action = await transaction.conversationAction.findFirst({
      where: {
        id: actionId,
        businessId: actor.businessId,
        expiresAt: { gt: now },
        conversation: { externalChatId: conversationKey(actor) },
      },
      select: { id: true, kind: true, payload: true, consumedAt: true },
    });
    const payload = storedPayload(action?.payload);
    if (
      !action
      || !payload
      || payload.actorUserId !== actor.userId
      || payload.telegramUserId !== actor.telegramUserId
      || (payload.mode === "MUTATION" && action.consumedAt)
    ) {
      throw invalidAction();
    }

    if (payload.mode === "MUTATION") {
      const consumed = await transaction.conversationAction.updateMany({
        where: { id: action.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) throw invalidAction();
    }
    return { kind: action.kind, payload: payload.data, mode: payload.mode };
  }, { isolationLevel: "Serializable" });
}

function conversationKey(actor: BusinessBotActionActor) {
  return `platform:${actor.destination.chatId}:${actor.telegramUserId}`;
}

function storedPayload(value: Prisma.JsonValue | undefined): StoredActionPayload | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const candidate = value as Record<string, Prisma.JsonValue>;
  if (
    typeof candidate.actorUserId !== "string"
    || typeof candidate.telegramUserId !== "string"
    || (candidate.mode !== "NAVIGATION" && candidate.mode !== "MUTATION")
    || !candidate.data
    || Array.isArray(candidate.data)
    || typeof candidate.data !== "object"
  ) return null;
  return candidate as StoredActionPayload;
}

function invalidAction() {
  return new Error("Business bot action is invalid or expired");
}
