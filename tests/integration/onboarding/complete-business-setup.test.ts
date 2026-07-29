import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { completeBusinessSetup } from "@/core/onboarding/complete-business-setup";
import { registerBusiness } from "@/core/onboarding/register-business";
import { prisma } from "@/core/database/prisma";

describe("first business setup", () => {
  const businessIds: string[] = [];
  const userIds: string[] = [];

  beforeEach(() => {
    process.env.CARD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
    delete process.env.CARD_ENCRYPTION_KEY;
  });

  it("creates the first service for the owner and configures direct payment", async () => {
    const suffix = randomUUID();
    const registered = await registerBusiness({
      ownerName: "Мухаммад",
      phone: `+9929${suffix.replace(/-/g, "").replace(/\D/g, "").padEnd(8, "3").slice(0, 8)}`,
      password: "safe-password-123",
      businessName: "Салон",
    });
    businessIds.push(registered.businessId);
    userIds.push(registered.userId);

    await completeBusinessSetup({
      businessId: registered.businessId,
      actorUserId: registered.userId,
      serviceName: "Мужская стрижка",
      durationMinutes: 45,
      amountSomoni: "50.00",
      recipientCard: "9762000128351953",
    });

    const service = await prisma.service.findFirstOrThrow({
      where: { branch: { businessId: registered.businessId } },
      include: { staffMembers: true, branch: true },
    });
    expect(service).toMatchObject({ name: "Мужская стрижка", durationMinutes: 45, amountDiram: 5000 });
    expect(service.staffMembers).toHaveLength(1);
    expect(service.branch.recipientCardLast4).toBe("1953");
    expect(service.branch.recipientCardEncrypted).not.toContain("9762000128351953");
  });
});
