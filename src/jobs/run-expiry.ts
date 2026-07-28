import { prisma } from "@/core/database/prisma";
import { expirePendingBookings } from "@/jobs/expire-pending-bookings";

void expirePendingBookings()
  .then(count => process.stdout.write(`Expired ${count} pending bookings.\n`))
  .finally(() => prisma.$disconnect());
