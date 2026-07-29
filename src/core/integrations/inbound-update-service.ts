import { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/core/database/prisma";

export async function claimInboundUpdate(input: {
  integrationId: string;
  externalUpdateId: string;
}, now = new Date()): Promise<"CLAIMED" | "COMPLETED" | "BUSY"> {
  try {
    await prisma.inboundChannelUpdate.create({ data: { ...input, claimedAt: now } });
    return "CLAIMED";
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.inboundChannelUpdate.findUniqueOrThrow({
        where: { integrationId_externalUpdateId: input },
      });
      if (existing.status === "COMPLETED") return "COMPLETED";
      const staleBefore = new Date(now.getTime() - 60_000);
      if (existing.status === "PROCESSING" && existing.claimedAt > staleBefore) return "BUSY";
      const reclaimed = await prisma.inboundChannelUpdate.updateMany({
        where: {
          id: existing.id,
          OR: [{ status: "FAILED" }, { status: "PROCESSING", claimedAt: { lte: staleBefore } }],
        },
        data: { status: "PROCESSING", claimedAt: now, attempts: { increment: 1 }, lastError: null },
      });
      return reclaimed.count === 1 ? "CLAIMED" : "BUSY";
    }
    throw error;
  }
}

export function completeInboundUpdate(id: { integrationId: string; externalUpdateId: string }, now = new Date()) {
  return prisma.inboundChannelUpdate.update({
    where: { integrationId_externalUpdateId: id },
    data: { status: "COMPLETED", completedAt: now, lastError: null },
  });
}

export function failInboundUpdate(id: { integrationId: string; externalUpdateId: string }) {
  return prisma.inboundChannelUpdate.update({
    where: { integrationId_externalUpdateId: id },
    data: { status: "FAILED", lastError: "Handler failed" },
  });
}
