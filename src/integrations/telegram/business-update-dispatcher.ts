import { prisma } from "@/core/database/prisma";
import { recognizeDushanbeCityReceipt } from "@/core/payments/dushanbe-city-receipt-recognizer";
import { storeReceipt } from "@/core/payments/receipt-storage";
import { decryptSecret } from "@/core/security/secret-encryption";
import { createTelegramApi } from "@/integrations/telegram/telegram-api";
import { handleTelegramUpdate } from "@/integrations/telegram/update-handler";

export type BusinessTelegramUpdate = {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
    photo?: Array<{ file_id: string }>;
  };
  callback_query?: { data?: string; message?: { chat: { id: number } } };
  [key: string]: unknown;
};

export type BusinessTelegramContext = {
  businessId: string;
  integrationId: string;
  token: string;
};

type BusinessUpdateHandler = (
  context: BusinessTelegramContext,
  update: BusinessTelegramUpdate,
) => Promise<void>;

export async function loadBusinessTelegramContext(publicId: string) {
  const integration = await prisma.businessTelegramIntegration.findFirst({
    where: { publicId, status: "ACTIVE" },
    select: { id: true, businessId: true, botTokenEncrypted: true, webhookSecretEncrypted: true },
  });
  if (!integration?.botTokenEncrypted || !integration.webhookSecretEncrypted) return null;
  const key = requiredEncryptionKey();
  return {
    businessId: integration.businessId,
    integrationId: integration.id,
    token: decryptSecret(integration.botTokenEncrypted, key),
    webhookSecret: decryptSecret(integration.webhookSecretEncrypted, key),
  };
}

export async function dispatchBusinessTelegramUpdate(
  publicId: string,
  update: BusinessTelegramUpdate,
  handler: BusinessUpdateHandler = defaultBusinessUpdateHandler,
) {
  const context = await loadBusinessTelegramContext(publicId);
  if (!context) throw new Error("Business Telegram integration was not found");
  await handler({
    businessId: context.businessId,
    integrationId: context.integrationId,
    token: context.token,
  }, update);
}

export async function dispatchLoadedBusinessTelegramUpdate(
  context: BusinessTelegramContext,
  update: BusinessTelegramUpdate,
  handler: BusinessUpdateHandler = defaultBusinessUpdateHandler,
) {
  await handler(context, update);
}

async function defaultBusinessUpdateHandler(
  context: BusinessTelegramContext,
  update: BusinessTelegramUpdate,
) {
  const telegram = createTelegramApi(context.token);
  await handleTelegramUpdate(context.businessId, update, {
    now: () => new Date(),
    sendMessage: telegram.sendMessage,
    downloadPhoto: async (fileId) => {
      const file = await telegram.getFile(fileId);
      return telegram.downloadFile(file.filePath);
    },
    storeReceipt,
    recognizeReceipt: recognizeDushanbeCityReceipt,
  });
}

function requiredEncryptionKey() {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!key) throw new Error("INTEGRATION_ENCRYPTION_KEY is required");
  return key;
}
