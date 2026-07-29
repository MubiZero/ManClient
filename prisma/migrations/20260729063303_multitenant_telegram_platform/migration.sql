-- CreateEnum
CREATE TYPE "TelegramIntegrationStatus" AS ENUM ('PENDING', 'ACTIVE', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'WAITING_FOR_OPERATOR', 'CLOSED');

-- CreateEnum
CREATE TYPE "ConversationChannel" AS ENUM ('TELEGRAM', 'WHATSAPP', 'WEB');

-- CreateTable
CREATE TABLE "BusinessTelegramIntegration" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "botUsername" TEXT NOT NULL,
    "botTokenEncrypted" TEXT,
    "webhookSecretEncrypted" TEXT,
    "status" "TelegramIntegrationStatus" NOT NULL DEFAULT 'PENDING',
    "lastWebhookError" TEXT,
    "connectedByUserId" TEXT,
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessTelegramIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessTelegramChat" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessTelegramChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "integrationId" TEXT,
    "channel" "ConversationChannel" NOT NULL,
    "externalChatId" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "flowVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationSession" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationAction" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundChannelUpdate" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalUpdateId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundChannelUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessTelegramIntegration_publicId_key" ON "BusinessTelegramIntegration"("publicId");

-- CreateIndex
CREATE INDEX "BusinessTelegramIntegration_businessId_status_idx" ON "BusinessTelegramIntegration"("businessId", "status");

-- CreateIndex
CREATE INDEX "BusinessTelegramIntegration_botId_status_idx" ON "BusinessTelegramIntegration"("botId", "status");

-- A business and Telegram bot may each have only one non-disconnected integration.
CREATE UNIQUE INDEX "BusinessTelegramIntegration_active_business_key"
ON "BusinessTelegramIntegration"("businessId")
WHERE "status" <> 'DISCONNECTED';

CREATE UNIQUE INDEX "BusinessTelegramIntegration_active_bot_key"
ON "BusinessTelegramIntegration"("botId")
WHERE "status" <> 'DISCONNECTED';

-- CreateIndex
CREATE INDEX "BusinessTelegramChat_chatId_active_idx" ON "BusinessTelegramChat"("chatId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessTelegramChat_membershipId_chatId_key" ON "BusinessTelegramChat"("membershipId", "chatId");

-- CreateIndex
CREATE INDEX "Conversation_integrationId_idx" ON "Conversation"("integrationId");

-- CreateIndex
CREATE INDEX "Conversation_businessId_status_idx" ON "Conversation"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_businessId_channel_externalChatId_key" ON "Conversation"("businessId", "channel", "externalChatId");

-- CreateIndex
CREATE INDEX "ConversationSession_conversationId_active_idx" ON "ConversationSession"("conversationId", "active");

CREATE UNIQUE INDEX "ConversationSession_active_conversation_key"
ON "ConversationSession"("conversationId")
WHERE "active" = true;

-- CreateIndex
CREATE INDEX "ConversationSession_expiresAt_idx" ON "ConversationSession"("expiresAt");

-- CreateIndex
CREATE INDEX "ConversationAction_businessId_expiresAt_idx" ON "ConversationAction"("businessId", "expiresAt");

-- CreateIndex
CREATE INDEX "ConversationAction_conversationId_consumedAt_idx" ON "ConversationAction"("conversationId", "consumedAt");

-- CreateIndex
CREATE INDEX "InboundChannelUpdate_receivedAt_idx" ON "InboundChannelUpdate"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InboundChannelUpdate_integrationId_externalUpdateId_key" ON "InboundChannelUpdate"("integrationId", "externalUpdateId");

-- AddForeignKey
ALTER TABLE "BusinessTelegramIntegration" ADD CONSTRAINT "BusinessTelegramIntegration_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessTelegramIntegration" ADD CONSTRAINT "BusinessTelegramIntegration_connectedByUserId_fkey" FOREIGN KEY ("connectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessTelegramChat" ADD CONSTRAINT "BusinessTelegramChat_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "BusinessTelegramIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationAction" ADD CONSTRAINT "ConversationAction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationAction" ADD CONSTRAINT "ConversationAction_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundChannelUpdate" ADD CONSTRAINT "InboundChannelUpdate_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "BusinessTelegramIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
