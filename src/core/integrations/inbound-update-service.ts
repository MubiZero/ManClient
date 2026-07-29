import { Prisma } from "@/generated/prisma/client";

import { prisma } from "@/core/database/prisma";

export async function claimInboundUpdate(input: {
  integrationId: string;
  externalUpdateId: string;
}) {
  try {
    await prisma.inboundChannelUpdate.create({ data: input });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return false;
    }
    throw error;
  }
}
