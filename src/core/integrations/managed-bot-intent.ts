import { prisma } from "@/core/database/prisma";

type ManagedBotActor = {
  membershipId: string;
  businessId: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "STAFF";
  telegramUserId: string;
};

type ManagedBotNames = {
  displayName: string;
  suggestedUsername: string;
};

const intentLifetimeMs = 30 * 60_000;
const processingLeaseMs = 60_000;

export class ManagedBotIntentBusyError extends Error {
  constructor() {
    super("Managed bot connection is processing");
    this.name = "ManagedBotIntentBusyError";
  }
}

export async function createManagedBotIntent(actor: ManagedBotActor, names: ManagedBotNames, now = new Date()) {
  const displayName = names.displayName.trim();
  const suggestedUsername = names.suggestedUsername.trim().replace(/^@/, "").toLowerCase();
  if (!displayName || displayName.length > 64 || !/^[a-z0-9_]{2,29}bot$/i.test(suggestedUsername)) {
    throw new Error("Managed bot names are invalid");
  }

  return prisma.$transaction(async transaction => {
    const membership = await transaction.membership.findFirst({
      where: {
        id: actor.membershipId,
        businessId: actor.businessId,
        userId: actor.userId,
        role: { in: ["OWNER", "ADMIN"] },
        telegramIdentities: { some: { telegramUserId: actor.telegramUserId } },
      },
      select: { id: true, businessId: true },
    });
    if (!membership) throw new Error("Managed bot connection is not allowed");

    await transaction.managedBotConnectionIntent.updateMany({
      where: { membershipId: membership.id, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    return transaction.managedBotConnectionIntent.create({
      data: {
        businessId: membership.businessId,
        membershipId: membership.id,
        telegramUserId: actor.telegramUserId,
        displayName,
        suggestedUsername,
        expiresAt: new Date(now.getTime() + intentLifetimeMs),
      },
    });
  }, { isolationLevel: "Serializable" });
}

export async function claimManagedBotIntent(
  input: { telegramUserId: string; botId: string },
  now = new Date(),
) {
  return prisma.$transaction(async transaction => {
    await transaction.managedBotConnectionIntent.updateMany({
      where: { telegramUserId: input.telegramUserId, status: "PENDING", expiresAt: { lte: now } },
      data: { status: "EXPIRED" },
    });
    const intent = await transaction.managedBotConnectionIntent.findFirst({
      where: {
        telegramUserId: input.telegramUserId,
        status: "PENDING",
        expiresAt: { gt: now },
        membership: { role: { in: ["OWNER", "ADMIN"] } },
      },
      include: { membership: { select: { userId: true, languageCode: true } } },
      orderBy: { createdAt: "desc" },
    });
    if (!intent) {
      const completed = await transaction.managedBotConnectionIntent.findFirst({
        where: { telegramUserId: input.telegramUserId, botId: input.botId, status: "COMPLETED" },
        include: { membership: { select: { userId: true, languageCode: true } } },
        orderBy: { completedAt: "desc" },
      });
      if (completed) return completed;
      const processing = await transaction.managedBotConnectionIntent.findFirst({
        where: {
          telegramUserId: input.telegramUserId,
          botId: input.botId,
          status: "PROCESSING",
          expiresAt: { gt: now },
          membership: { role: { in: ["OWNER", "ADMIN"] } },
        },
        include: { membership: { select: { userId: true, languageCode: true } } },
        orderBy: { updatedAt: "desc" },
      });
      if (processing) {
        const leaseExpiredAt = new Date(now.getTime() - processingLeaseMs);
        const reclaimed = await transaction.managedBotConnectionIntent.updateMany({
          where: { id: processing.id, status: "PROCESSING", processingStartedAt: { lte: leaseExpiredAt } },
          data: { processingStartedAt: now, lastErrorCode: "STALE_PROCESSING_RECLAIMED" },
        });
        if (reclaimed.count === 1) return processing;
        throw new ManagedBotIntentBusyError();
      }
      throw new Error("Managed bot connection intent not found");
    }

    if (intent.botId && intent.botId !== input.botId) {
      throw new Error("Managed bot connection intent not found");
    }
    const claimed = await transaction.managedBotConnectionIntent.updateMany({
      where: { id: intent.id, status: "PENDING", expiresAt: { gt: now } },
      data: { botId: input.botId, status: "PROCESSING", processingStartedAt: now },
    });
    if (claimed.count !== 1) throw new Error("Managed bot connection intent not found");
    return { ...intent, botId: input.botId, status: "PROCESSING" as const };
  }, { isolationLevel: "Serializable" });
}

export async function completeManagedBotIntent(intentId: string, botId: string, now = new Date()) {
  await prisma.managedBotConnectionIntent.updateMany({
    where: { id: intentId, botId, status: { in: ["PENDING", "PROCESSING"] } },
    data: { status: "COMPLETED", completedAt: now, processingStartedAt: null, lastErrorCode: null },
  });
  const intent = await prisma.managedBotConnectionIntent.findUnique({ where: { id: intentId } });
  if (!intent || intent.botId !== botId || intent.status !== "COMPLETED") {
    throw new Error("Managed bot connection intent not found");
  }
  return intent;
}

export async function failManagedBotIntent(intentId: string, errorCode: string) {
  return prisma.managedBotConnectionIntent.update({
    where: { id: intentId },
    data: { status: "PENDING", botId: null, processingStartedAt: null, lastErrorCode: errorCode.slice(0, 64) },
  });
}
