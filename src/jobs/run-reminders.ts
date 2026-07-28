import { prisma } from "@/core/database/prisma";
import { sendDueBookingReminders } from "@/jobs/send-booking-reminder";

void sendDueBookingReminders()
  .then(count => process.stdout.write(`Processed ${count} due messages.\n`))
  .finally(() => prisma.$disconnect());
