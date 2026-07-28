import { prisma } from "@/core/database/prisma";

export function findBooking(bookingId: string) {
  return prisma.booking.findUnique({
    where: { id: bookingId },
    include: { customer: true, payment: true, resources: true, service: true, staff: true },
  });
}
