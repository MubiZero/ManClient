import { createHmac, timingSafeEqual } from "node:crypto";

import { prisma } from "@/core/database/prisma";

type CreatePlatformChatLinkInput = {
  membershipId: string;
  actorUserId: string;
  expiresAt: Date;
};

export async function createPlatformChatLink(input: CreatePlatformChatLinkInput) {
  const membership = await prisma.membership.findFirst({
    where: {
      id: input.membershipId,
      userId: input.actorUserId,
      role: { in: ["OWNER", "ADMIN"] },
    },
    select: { id: true },
  });
  if (!membership) throw new Error("Business manager membership is required");
  if (input.expiresAt <= new Date()) throw new Error("Platform chat link must expire in the future");

  const link = await prisma.platformChatLink.create({
    data: { membershipId: membership.id, expiresAt: input.expiresAt },
    select: { id: true },
  });
  return `${link.id}.${sign(link.id)}`;
}

export async function consumePlatformChatLink(token: string, chatId: string, now = new Date()) {
  const linkId = verify(token);
  return prisma.$transaction(async (transaction) => {
    const claimed = await transaction.platformChatLink.updateMany({
      where: { id: linkId, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (claimed.count !== 1) throw new Error("Platform chat link is invalid or expired");

    const link = await transaction.platformChatLink.findUniqueOrThrow({
      where: { id: linkId },
      include: { membership: { include: { business: true, user: true } } },
    });
    if (!["OWNER", "ADMIN"].includes(link.membership.role)) {
      throw new Error("Platform chat link is invalid or expired");
    }

    await transaction.businessTelegramChat.updateMany({
      where: { chatId, active: true },
      data: { active: false, disabledAt: now },
    });
    await transaction.businessTelegramChat.upsert({
      where: { membershipId_chatId: { membershipId: link.membershipId, chatId } },
      create: { membershipId: link.membershipId, chatId, active: true, linkedAt: now },
      update: { active: true, linkedAt: now, disabledAt: null },
    });
    return link.membership;
  }, { isolationLevel: "Serializable" });
}

export function getActivePlatformChatMembership(chatId: string) {
  return prisma.membership.findFirst({
    where: { telegramChats: { some: { chatId, active: true } } },
    include: { business: true, user: true },
  });
}

function sign(linkId: string) {
  const secret = requiredSecret();
  return createHmac("sha256", secret).update(linkId).digest().subarray(0, 16).toString("base64url");
}

function verify(token: string) {
  const [linkId, signature] = token.split(".");
  if (!linkId || !signature) throw new Error("Platform chat link is invalid or expired");
  const expected = Buffer.from(sign(linkId));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    throw new Error("Platform chat link is invalid or expired");
  }
  return linkId;
}

function requiredSecret() {
  const secret = process.env.PLATFORM_LINK_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("PLATFORM_LINK_SECRET must contain at least 32 characters");
  }
  return secret;
}
