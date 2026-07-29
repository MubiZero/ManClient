import type { Prisma } from "@/generated/prisma/client";

import { BookingOperationError } from "@/core/booking-operations/booking-operation-error";
import { prisma } from "@/core/database/prisma";

type AccessDatabase = Pick<Prisma.TransactionClient, "membership">;

export async function requireBookingAccess(input: { businessId: string; actorUserId: string }, database: AccessDatabase = prisma) {
  const membership = await database.membership.findUnique({
    where: { businessId_userId: { businessId: input.businessId, userId: input.actorUserId } },
    select: { id: true, role: true, userId: true, businessId: true, staff: { select: { id: true } } },
  });
  if (!membership) throw new BookingOperationError("FORBIDDEN");
  return { ...membership, staffId: membership.staff?.id ?? null };
}

export function bookingScopeWhere(scope: Awaited<ReturnType<typeof requireBookingAccess>>): Prisma.BookingWhereInput {
  return { businessId: scope.businessId, ...(scope.role === "STAFF" ? { staffId: scope.staffId ?? "__none__" } : {}) };
}
