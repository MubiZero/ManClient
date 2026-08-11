import type { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/core/database/prisma";

type AuditDatabase = Pick<Prisma.TransactionClient, "auditEvent">;
type AuditEventInput = {
  businessId: string;
  bookingId?: string;
  type: string;
  actorType: string;
  actorId?: string;
  metadata?: Prisma.InputJsonObject;
};

/**
 * An event that belongs to the platform rather than to any one business — what a plan costs, who
 * changed it. Kept as its own function so that `writeAuditEvent` can go on demanding a business and
 * a forgotten `businessId` still fails to compile.
 */
export function writePlatformAuditEvent(
  input: { type: string; actorId?: string; metadata?: Prisma.InputJsonObject },
  database: AuditDatabase = prisma,
) {
  return database.auditEvent.create({
    data: {
      type: input.type,
      actorType: "platform_admin",
      actorId: input.actorId,
      metadata: input.metadata ?? {},
    },
  });
}

export function writeAuditEvent(input: AuditEventInput, database: AuditDatabase = prisma) {
  return database.auditEvent.create({
    data: {
      businessId: input.businessId,
      bookingId: input.bookingId,
      type: input.type,
      actorType: input.actorType,
      actorId: input.actorId,
      metadata: input.metadata ?? {},
    },
  });
}
