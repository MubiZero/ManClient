import { z } from "zod";

import { prisma } from "@/core/database/prisma";

const inputSchema = z.object({
  businessId: z.string().min(1),
  actorUserId: z.string().min(1),
  branchId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
}).strict();

export async function updateBranchProfile(input: z.input<typeof inputSchema>) {
  const parsed = inputSchema.parse(input);
  const membership = await prisma.membership.findUnique({
    where: { businessId_userId: { businessId: parsed.businessId, userId: parsed.actorUserId } },
    select: { role: true },
  });
  if (!membership || membership.role === "STAFF") throw new Error("FORBIDDEN");
  const result = await prisma.branch.updateMany({
    where: { id: parsed.branchId, businessId: parsed.businessId },
    data: { name: parsed.name },
  });
  if (result.count !== 1) throw new Error("BRANCH_NOT_FOUND");
}
