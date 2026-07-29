import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { registerBusiness } from "@/core/onboarding/register-business";
import { updateBranchProfile } from "@/core/onboarding/update-branch-profile";
import { prisma } from "@/core/database/prisma";

describe("branch profile", () => {
  const businessIds: string[] = [];
  const userIds: string[] = [];
  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  });

  it("lets a manager rename only a branch from their business", async () => {
    const suffix = randomUUID().replace(/\D/g, "").padEnd(8, "4").slice(0, 8);
    const registered = await registerBusiness({ ownerName: "Owner", phone: `+9929${suffix}`, password: "safe-password-123", businessName: "Business" });
    businessIds.push(registered.businessId);
    userIds.push(registered.userId);
    const branch = await prisma.branch.findFirstOrThrow({ where: { businessId: registered.businessId } });

    await updateBranchProfile({ businessId: registered.businessId, actorUserId: registered.userId, branchId: branch.id, name: "Душанбе, центр" });

    await expect(prisma.branch.findUnique({ where: { id: branch.id } })).resolves.toMatchObject({ name: "Душанбе, центр" });
  });
});
