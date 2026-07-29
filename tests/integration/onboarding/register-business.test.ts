import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { verifyPassword } from "@/core/auth/password";
import { prisma } from "@/core/database/prisma";
import { registerBusiness, RegistrationError } from "@/core/onboarding/register-business";

describe("business registration", () => {
  const emails: string[] = [];
  const businessIds: string[] = [];

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { email: { in: emails.splice(0) } } });
  });

  it("atomically creates an owner, business, main branch, staff profile and schedule", async () => {
    const suffix = randomUUID();
    const email = `OWNER-${suffix}@Example.test`;
    emails.push(email.toLowerCase());

    const result = await registerBusiness({
      ownerName: "  Мухаммад  ",
      email,
      password: "safe-password-123",
      businessName: "  Салон Сино  ",
      branchName: "  Душанбе, центр  ",
    });
    businessIds.push(result.businessId);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: result.userId },
      include: {
        memberships: {
          include: { business: { include: { branches: { include: { scheduleRules: true, staffMembers: true } } } } },
        },
      },
    });
    const membership = user.memberships[0];
    const branch = membership.business.branches[0];

    expect(user).toMatchObject({ email: email.toLowerCase(), displayName: "Мухаммад" });
    expect(await verifyPassword("safe-password-123", user.passwordHash!)).toBe(true);
    expect(membership.role).toBe("OWNER");
    expect(membership.business.name).toBe("Салон Сино");
    expect(branch.name).toBe("Душанбе, центр");
    expect(branch.staffMembers).toHaveLength(1);
    expect(branch.scheduleRules).toHaveLength(7);
  });

  it("rejects a duplicate email without creating another business", async () => {
    const suffix = randomUUID();
    const email = `duplicate-${suffix}@example.test`;
    emails.push(email);
    const input = {
      ownerName: "Owner",
      email,
      password: "safe-password-123",
      businessName: "First Business",
      branchName: "Main Branch",
    };
    const first = await registerBusiness(input);
    businessIds.push(first.businessId);
    const before = await prisma.business.count();

    await expect(registerBusiness({ ...input, businessName: "Second Business" }))
      .rejects.toBeInstanceOf(RegistrationError);
    await expect(prisma.business.count()).resolves.toBe(before);
  });
});
