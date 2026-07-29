import { randomBytes } from "node:crypto";

import { prisma } from "@/core/database/prisma";
import { decryptSecret, encryptSecret } from "@/core/security/secret-encryption";
import { createTelegramApi, TelegramApiError, type TelegramIdentity } from "@/integrations/telegram/telegram-api";

export type BusinessTelegramApi = {
  getMe(): Promise<TelegramIdentity>;
  setWebhook(url: string, secretToken: string): Promise<void>;
  deleteWebhook(): Promise<void>;
};

type MutationInput = { businessId: string; actorUserId: string };
type ConnectInput = MutationInput & { token: string };

export type BusinessTelegramErrorCode =
  | "INVALID_BOT_TOKEN"
  | "BOT_ALREADY_CONNECTED"
  | "TELEGRAM_UNAVAILABLE"
  | "FORBIDDEN"
  | "NOT_CONNECTED"
  | "CONFIGURATION_ERROR";

export class BusinessTelegramIntegrationError extends Error {
  constructor(public readonly code: BusinessTelegramErrorCode) {
    super(code);
    this.name = "BusinessTelegramIntegrationError";
  }
}

export async function connectBusinessTelegramBot(
  input: ConnectInput,
  telegram: BusinessTelegramApi = createTelegramApi(input.token),
) {
  await requireManager(input);
  const identity = await validatedIdentity(telegram);
  await rejectConnectedBot(String(identity.id));

  const encryptionKey = requiredEncryptionKey();
  const publicId = randomBytes(24).toString("base64url");
  const webhookSecret = randomBytes(32).toString("base64url");
  const pending = await createPendingIntegration({
    ...input,
    identity,
    publicId,
    webhookSecret,
    encryptionKey,
  });

  try {
    await telegram.setWebhook(webhookUrl(publicId), webhookSecret);
  } catch {
    await prisma.businessTelegramIntegration.delete({ where: { id: pending.id } });
    throw new BusinessTelegramIntegrationError("TELEGRAM_UNAVAILABLE");
  }

  return prisma.$transaction(async (transaction) => {
    const connected = await transaction.businessTelegramIntegration.update({
      where: { id: pending.id },
      data: { status: "ACTIVE", connectedAt: new Date(), lastWebhookError: null },
      select: { id: true, publicId: true, status: true, botUsername: true, connectedAt: true },
    });
    await transaction.auditEvent.create({
      data: {
        businessId: input.businessId,
        type: "telegram.integration.connected",
        actorType: "user",
        actorId: input.actorUserId,
        metadata: { integrationId: connected.id, botUsername: connected.botUsername },
      },
    });
    return connected;
  });
}

export async function rotateBusinessTelegramBot(
  input: ConnectInput,
  replacementTelegram: BusinessTelegramApi = createTelegramApi(input.token),
  currentTelegram?: BusinessTelegramApi,
) {
  await requireManager(input);
  const current = await activeIntegration(input.businessId);
  const identity = await validatedIdentity(replacementTelegram);
  await rejectConnectedBot(String(identity.id), current.id);

  const encryptionKey = requiredEncryptionKey();
  const publicId = randomBytes(24).toString("base64url");
  const webhookSecret = randomBytes(32).toString("base64url");
  try {
    await replacementTelegram.setWebhook(webhookUrl(publicId), webhookSecret);
  } catch {
    throw new BusinessTelegramIntegrationError("TELEGRAM_UNAVAILABLE");
  }

  const previousToken = current.botTokenEncrypted
    ? decryptSecret(current.botTokenEncrypted, encryptionKey)
    : null;
  const rotated = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.businessTelegramIntegration.update({
      where: { id: current.id },
      data: {
        publicId,
        botId: String(identity.id),
        botUsername: identity.username,
        botTokenEncrypted: encryptSecret(input.token, encryptionKey),
        webhookSecretEncrypted: encryptSecret(webhookSecret, encryptionKey),
        status: "ACTIVE",
        connectedByUserId: input.actorUserId,
        connectedAt: new Date(),
        disconnectedAt: null,
        lastWebhookError: null,
      },
      select: { id: true, publicId: true, status: true, botUsername: true, connectedAt: true },
    });
    await transaction.auditEvent.create({
      data: {
        businessId: input.businessId,
        type: "telegram.integration.rotated",
        actorType: "user",
        actorId: input.actorUserId,
        metadata: { integrationId: updated.id, botUsername: updated.botUsername },
      },
    });
    return updated;
  });

  if (previousToken && current.botId !== String(identity.id)) {
    try {
      await (currentTelegram ?? createTelegramApi(previousToken)).deleteWebhook();
    } catch {
      // The old public route no longer resolves; cleanup can be retried operationally.
    }
  }
  return rotated;
}

export async function disconnectBusinessTelegramBot(
  input: MutationInput,
  telegram?: BusinessTelegramApi,
) {
  await requireManager(input);
  const current = await activeIntegration(input.businessId);
  const encryptionKey = requiredEncryptionKey();
  if (!telegram) {
    if (!current.botTokenEncrypted) throw new BusinessTelegramIntegrationError("NOT_CONNECTED");
    telegram = createTelegramApi(decryptSecret(current.botTokenEncrypted, encryptionKey));
  }

  try {
    await telegram.deleteWebhook();
  } catch {
    throw new BusinessTelegramIntegrationError("TELEGRAM_UNAVAILABLE");
  }

  return prisma.$transaction(async (transaction) => {
    const disconnected = await transaction.businessTelegramIntegration.update({
      where: { id: current.id },
      data: {
        status: "DISCONNECTED",
        botTokenEncrypted: null,
        webhookSecretEncrypted: null,
        disconnectedAt: new Date(),
      },
      select: { id: true, status: true, botUsername: true, disconnectedAt: true },
    });
    await transaction.auditEvent.create({
      data: {
        businessId: input.businessId,
        type: "telegram.integration.disconnected",
        actorType: "user",
        actorId: input.actorUserId,
        metadata: { integrationId: disconnected.id, botUsername: disconnected.botUsername },
      },
    });
    return disconnected;
  });
}

export async function getBusinessTelegramStatus(businessId: string) {
  return prisma.businessTelegramIntegration.findFirst({
    where: { businessId, status: { not: "DISCONNECTED" } },
    select: { id: true, publicId: true, status: true, botUsername: true, connectedAt: true, lastWebhookError: true },
  });
}

async function requireManager({ businessId, actorUserId }: MutationInput) {
  const membership = await prisma.membership.findUnique({
    where: { businessId_userId: { businessId, userId: actorUserId } },
    select: { role: true },
  });
  if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
    throw new BusinessTelegramIntegrationError("FORBIDDEN");
  }
}

async function validatedIdentity(telegram: BusinessTelegramApi) {
  try {
    return await telegram.getMe();
  } catch (error) {
    if (error instanceof TelegramApiError && error.status === 401) {
      throw new BusinessTelegramIntegrationError("INVALID_BOT_TOKEN");
    }
    if (error instanceof Error && error.message === "Telegram bot must have a username") {
      throw new BusinessTelegramIntegrationError("INVALID_BOT_TOKEN");
    }
    throw new BusinessTelegramIntegrationError("TELEGRAM_UNAVAILABLE");
  }
}

async function rejectConnectedBot(botId: string, exceptId?: string) {
  const existing = await prisma.businessTelegramIntegration.findFirst({
    where: { botId, status: { not: "DISCONNECTED" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (existing) throw new BusinessTelegramIntegrationError("BOT_ALREADY_CONNECTED");
}

async function activeIntegration(businessId: string) {
  const integration = await prisma.businessTelegramIntegration.findFirst({
    where: { businessId, status: { not: "DISCONNECTED" } },
  });
  if (!integration) throw new BusinessTelegramIntegrationError("NOT_CONNECTED");
  return integration;
}

async function createPendingIntegration(input: ConnectInput & {
  identity: TelegramIdentity;
  publicId: string;
  webhookSecret: string;
  encryptionKey: string;
}) {
  try {
    return await prisma.businessTelegramIntegration.create({
      data: {
        businessId: input.businessId,
        publicId: input.publicId,
        botId: String(input.identity.id),
        botUsername: input.identity.username,
        botTokenEncrypted: encryptSecret(input.token, input.encryptionKey),
        webhookSecretEncrypted: encryptSecret(input.webhookSecret, input.encryptionKey),
        status: "PENDING",
        connectedByUserId: input.actorUserId,
      },
    });
  } catch {
    throw new BusinessTelegramIntegrationError("BOT_ALREADY_CONNECTED");
  }
}

function requiredEncryptionKey() {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!key) throw new BusinessTelegramIntegrationError("CONFIGURATION_ERROR");
  return key;
}

function webhookUrl(publicId: string) {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new BusinessTelegramIntegrationError("CONFIGURATION_ERROR");
  return `${appUrl.replace(/\/$/, "")}/api/webhooks/telegram/business/${publicId}`;
}
