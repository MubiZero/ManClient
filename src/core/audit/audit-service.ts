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
