-- CreateTable
CREATE TABLE "PlatformChatLink" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformChatLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformChatLink_membershipId_expiresAt_idx" ON "PlatformChatLink"("membershipId", "expiresAt");

-- CreateIndex
CREATE INDEX "PlatformChatLink_expiresAt_consumedAt_idx" ON "PlatformChatLink"("expiresAt", "consumedAt");

-- A private platform chat has one explicitly selected business at a time.
CREATE UNIQUE INDEX "BusinessTelegramChat_active_chat_key"
ON "BusinessTelegramChat"("chatId")
WHERE "active" = true;

-- AddForeignKey
ALTER TABLE "PlatformChatLink" ADD CONSTRAINT "PlatformChatLink_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
