import { createHmac, timingSafeEqual } from "node:crypto";

import { prisma } from "@/core/database/prisma";

type CreatePlatformChatLinkInput = {
  membershipId: string;
  actorUserId: string;
  expiresAt: Date;
};

type PlatformTelegramDestinationInput = {
  chatId: string;
  chatType: string;
  telegramUserId: string;
};

type PlatformTelegramActorInput = Pick<PlatformTelegramDestinationInput, "chatId" | "telegramUserId">;

export async function createPlatformChatLink(input: CreatePlatformChatLinkInput) {
  const membership = await prisma.membership.findFirst({
    where: { id: input.membershipId, userId: input.actorUserId },
    select: { id: true },
  });
  if (!membership) throw new Error("Business membership is required");
  if (input.expiresAt <= new Date()) throw new Error("Platform chat link must expire in the future");

  const link = await prisma.platformChatLink.create({
    data: { membershipId: membership.id, expiresAt: input.expiresAt },
    select: { id: true },
  });
  return `${link.id}.${sign(link.id)}`;
}

export async function consumePlatformChatLink(
  token: string,
  destination: PlatformTelegramDestinationInput,
  now = new Date(),
) {
  const linkId = verify(token);
  const chatType = normalizeChatType(destination.chatType);
  if (!destination.chatId || !destination.telegramUserId) throw invalidLink();

  return prisma.$transaction(async (transaction) => {
    const link = await transaction.platformChatLink.findUnique({
      where: { id: linkId },
      include: { membership: { include: { business: true, user: true } } },
    });
    if (!link || link.consumedAt || link.expiresAt <= now) throw invalidLink();
    if (chatType !== "PRIVATE" && link.membership.role === "STAFF") throw invalidLink();

    const claimed = await transaction.platformChatLink.updateMany({
      where: { id: linkId, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (claimed.count !== 1) throw invalidLink();

    const identity = await transaction.businessTelegramIdentity.upsert({
      where: {
        membershipId_telegramUserId: {
          membershipId: link.membershipId,
          telegramUserId: destination.telegramUserId,
        },
      },
      create: { membershipId: link.membershipId, telegramUserId: destination.telegramUserId },
      update: {},
      select: { id: true },
    });

    await transaction.businessTelegramChat.updateMany({
      where: { chatId: destination.chatId, active: true },
      data: { active: false, disabledAt: now },
    });
    await transaction.businessTelegramChat.upsert({
      where: {
        telegramIdentityId_chatId: {
          telegramIdentityId: identity.id,
          chatId: destination.chatId,
        },
      },
      create: {
        telegramIdentityId: identity.id,
        chatId: destination.chatId,
        chatType,
        active: true,
        linkedAt: now,
      },
      update: { chatType, active: true, linkedAt: now, disabledAt: null },
    });
    return link.membership;
  }, { isolationLevel: "Serializable" });
}

export async function getPlatformTelegramActor(input: PlatformTelegramActorInput) {
  const destination = await prisma.businessTelegramChat.findFirst({
    where: {
      chatId: input.chatId,
      active: true,
      telegramIdentity: { telegramUserId: input.telegramUserId },
    },
    select: {
      chatId: true,
      chatType: true,
      telegramIdentity: {
        select: {
          membershipId: true,
          membership: {
            select: {
              businessId: true,
              role: true,
              userId: true,
              languageCode: true,
              business: true,
              user: true,
            },
          },
        },
      },
    },
  });
  if (!destination) return null;

  const membership = destination.telegramIdentity.membership;
  return {
    membershipId: destination.telegramIdentity.membershipId,
    businessId: membership.businessId,
    role: membership.role,
    userId: membership.userId,
    languageCode: membership.languageCode,
    business: membership.business,
    user: membership.user,
    destination: { chatId: destination.chatId, chatType: destination.chatType.toLowerCase() },
  };
}

export async function listBusinessTelegramDestinations(businessId: string) {
  return prisma.businessTelegramChat.findMany({
    where: {
      active: true,
      telegramIdentity: { membership: { businessId } },
    },
    select: {
      id: true,
      chatId: true,
      chatType: true,
      telegramIdentity: {
        select: {
          membershipId: true,
          telegramUserId: true,
          membership: { select: { userId: true, role: true, staff: { select: { id: true } } } },
        },
      },
    },
    orderBy: { linkedAt: "asc" },
  }).then(destinations => destinations.map(destination => ({
    destinationId: destination.id,
    chatId: destination.chatId,
    chatType: destination.chatType.toLowerCase(),
    membershipId: destination.telegramIdentity.membershipId,
    telegramUserId: destination.telegramIdentity.telegramUserId,
    userId: destination.telegramIdentity.membership.userId,
    role: destination.telegramIdentity.membership.role,
    staffId: destination.telegramIdentity.membership.staff?.id ?? null,
  })));
}

function normalizeChatType(chatType: string) {
  switch (chatType) {
    case "private": return "PRIVATE";
    case "group": return "GROUP";
    case "supergroup": return "SUPERGROUP";
    case "channel": return "CHANNEL";
    default: throw invalidLink();
  }
}

function sign(linkId: string) {
  const secret = requiredSecret();
  return createHmac("sha256", secret).update(linkId).digest().subarray(0, 16).toString("base64url");
}

function verify(token: string) {
  const [linkId, signature] = token.split(".");
  if (!linkId || !signature) throw invalidLink();
  const expected = Buffer.from(sign(linkId));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) throw invalidLink();
  return linkId;
}

function invalidLink() {
  return new Error("Platform chat link is invalid or expired");
}

function requiredSecret() {
  const secret = process.env.PLATFORM_LINK_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("PLATFORM_LINK_SECRET must contain at least 32 characters");
  }
  return secret;
}
