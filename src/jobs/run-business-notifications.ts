import { prisma } from "@/core/database/prisma";
import { sendDueBusinessTelegramNotifications } from "@/jobs/send-business-telegram-notifications";

void sendDueBusinessTelegramNotifications()
  .then(count => process.stdout.write(`Processed ${count} business Telegram notifications.\n`))
  .finally(() => prisma.$disconnect());
