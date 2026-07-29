import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { verifyPassword } from "@/core/auth/password";
import { prisma } from "@/core/database/prisma";
import { registerBusiness, RegistrationError } from "@/core/onboarding/register-business";

describe("business registration", () => {
  const phones: string[] = [];
  const businessIds: string[] = [];

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { phone: { in: phones.splice(0) } } });
  });

  it("atomically creates an owner, business, main branch, staff profile and schedule", async () => {
    const suffix = randomUUID();
    const phone = `+9929${suffix.replace(/-/g, "").replace(/\D/g, "").padEnd(8, "1").slice(0, 8)}`;
    phones.push(phone);

    const result = await registerBusiness({
      ownerName: "  Мухаммад  ",
      phone,
      password: "12345678",
      businessName: "  Салон Сино  ",
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

    expect(user).toMatchObject({ email: null, phone, displayName: "Мухаммад" });
    expect(await verifyPassword("12345678", user.passwordHash!)).toBe(true);
    expect(membership.role).toBe("OWNER");
    expect(membership.business.name).toBe("Салон Сино");
    expect(branch.name).toBe("Основной филиал");
    expect(branch.staffMembers).toHaveLength(1);
    expect(branch.scheduleRules).toHaveLength(7);
  });

  it("rejects a duplicate phone without creating another business", async () => {
    const suffix = randomUUID();
    const phone = `+9929${suffix.replace(/-/g, "").replace(/\D/g, "").padEnd(8, "2").slice(0, 8)}`;
    phones.push(phone);
    const input = {
      ownerName: "Owner",
      phone,
      password: "safe-password-123",
      businessName: "First Business",
    };
    const first = await registerBusiness(input);
    businessIds.push(first.businessId);
    const before = await prisma.business.count();

    await expect(registerBusiness({ ...input, businessName: "Second Business" }))
      .rejects.toBeInstanceOf(RegistrationError);
    await expect(prisma.business.count()).resolves.toBe(before);
  });
});
