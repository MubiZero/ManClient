import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";

import { prisma } from "@/core/database/prisma";
import { OnboardingStepError } from "@/core/onboarding/onboarding-step-error";

const inputSchema = z.object({
  businessId: z.string().min(1),
  actorUserId: z.string().min(1),
  serviceName: z.string().trim().min(2).max(120),
  durationMinutes: z.coerce.number().int().min(15).max(720),
  amountSomoni: z.string().trim().regex(/^\d{1,7}(?:\.\d{1,2})?$/),
}).strict();

const updateInputSchema = inputSchema.extend({ serviceId: z.string().min(1) }).strict();

export async function createFirstService(input: z.input<typeof inputSchema>) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new OnboardingStepError("INVALID_INPUT");
  const amountDiram = Math.round(Number(parsed.data.amountSomoni) * 100);
  if (amountDiram < 1) throw new OnboardingStepError("INVALID_INPUT");

  try {
    return await prisma.$transaction(async transaction => {
      const membership = await transaction.membership.findUnique({
        where: { businessId_userId: { businessId: parsed.data.businessId, userId: parsed.data.actorUserId } },
        include: { staff: true },
      });
      if (!membership || membership.role === "STAFF" || !membership.staff) {
        throw new OnboardingStepError("FORBIDDEN");
      }
      const existingService = await transaction.service.findFirst({
        where: { branch: { businessId: parsed.data.businessId } },
        select: { id: true },
      });
      if (existingService) throw new OnboardingStepError("ALREADY_COMPLETED");
      const branch = await transaction.branch.findFirst({
        where: { businessId: parsed.data.businessId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!branch) throw new OnboardingStepError("INVALID_INPUT");

      return transaction.service.create({
        data: {
          branchId: branch.id,
          name: parsed.data.serviceName,
          durationMinutes: parsed.data.durationMinutes,
          amountDiram,
          staffMembers: { connect: { id: membership.staff.id } },
        },
      });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      const exists = await prisma.service.findFirst({
        where: { branch: { businessId: parsed.data.businessId } },
        select: { id: true },
      });
      if (exists) throw new OnboardingStepError("ALREADY_COMPLETED");
    }
    throw error;
  }
}

export async function updateFirstService(input: z.input<typeof updateInputSchema>) {
  const parsed = updateInputSchema.safeParse(input);
  if (!parsed.success) throw new OnboardingStepError("INVALID_INPUT");
  const amountDiram = Math.round(Number(parsed.data.amountSomoni) * 100);
  if (amountDiram < 1) throw new OnboardingStepError("INVALID_INPUT");

  const membership = await prisma.membership.findUnique({
    where: { businessId_userId: { businessId: parsed.data.businessId, userId: parsed.data.actorUserId } },
    select: { role: true },
  });
  if (!membership || membership.role === "STAFF") throw new OnboardingStepError("FORBIDDEN");

  const result = await prisma.service.updateMany({
    where: { id: parsed.data.serviceId, branch: { businessId: parsed.data.businessId } },
    data: {
      name: parsed.data.serviceName,
      durationMinutes: parsed.data.durationMinutes,
      amountDiram,
    },
  });
  if (result.count !== 1) throw new OnboardingStepError("FORBIDDEN");
}
