import { BookingStatus, Prisma } from "@/generated/prisma/client";

import { prisma } from "@/core/database/prisma";

import type { ReserveAllocationInput } from "./booking-types";

const ACTIVE_BOOKING_STATUSES = [BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED];
const SERIALIZATION_RETRY_COUNT = 3;

type BookingConflictCode = "RESOURCE_UNAVAILABLE" | "STAFF_UNAVAILABLE";

export class BookingConflictError extends Error {
  readonly code: BookingConflictCode;

  constructor(code: BookingConflictCode) {
    super(code);
    this.name = "BookingConflictError";
    this.code = code;
  }
}

export async function reserveAllocation(input: ReserveAllocationInput) {
  const endsAt = calculateEndsAt(input.startsAt, input.durationMinutes);

  return runSerializableTransaction(async (transaction) => {
    const branch = await transaction.branch.findUnique({
      where: { id: input.branchId },
      select: { businessId: true },
    });

    if (!branch) {
      throw new Error("Branch does not exist");
    }

    await assertAllocationBelongsToBranch(transaction, input);

    const existingBooking = await transaction.booking.findFirst({
      where: {
        branchId: input.branchId,
        status: { in: ACTIVE_BOOKING_STATUSES },
        startsAt: { lt: endsAt },
        endsAt: { gt: input.startsAt },
        OR: [
          { staffId: input.staffId },
          ...(input.resourceIds.length > 0
            ? [{ resources: { some: { resourceId: { in: input.resourceIds } } } }]
            : []),
        ],
      },
      include: { resources: true },
    });

    if (existingBooking) {
      const hasConflictingResource = existingBooking.resources.some((resource) =>
        input.resourceIds.includes(resource.resourceId),
      );

      throw new BookingConflictError(hasConflictingResource ? "RESOURCE_UNAVAILABLE" : "STAFF_UNAVAILABLE");
    }

    return transaction.booking.create({
      data: {
        businessId: branch.businessId,
        branchId: input.branchId,
        staffId: input.staffId,
        startsAt: input.startsAt,
        endsAt,
        resources: {
          create: input.resourceIds.map((resourceId) => ({ resourceId })),
        },
      },
      include: { resources: true },
    });
  });
}

function calculateEndsAt(startsAt: Date, durationMinutes: number): Date {
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    throw new Error("Duration must be a positive integer");
  }

  return new Date(startsAt.getTime() + durationMinutes * 60_000);
}

async function assertAllocationBelongsToBranch(
  transaction: Prisma.TransactionClient,
  input: ReserveAllocationInput,
): Promise<void> {
  const staff = await transaction.staffMember.findFirst({
    where: { id: input.staffId, branchId: input.branchId },
    select: { id: true },
  });

  if (!staff) {
    throw new Error("Staff member does not belong to branch");
  }

  if (input.resourceIds.length === 0) {
    return;
  }

  const resources = await transaction.resource.findMany({
    where: {
      id: { in: input.resourceIds },
      branchId: input.branchId,
    },
    select: { id: true },
  });

  if (resources.length !== new Set(input.resourceIds).size) {
    throw new Error("Resource does not belong to branch");
  }
}

async function runSerializableTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < SERIALIZATION_RETRY_COUNT; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!isSerializationFailure(error) || attempt === SERIALIZATION_RETRY_COUNT - 1) {
        throw error;
      }
    }
  }

  throw new Error("Serializable transaction retry limit reached");
}

function isSerializationFailure(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}
