import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { verifyPassword } from "@/core/auth/password";
import { prisma } from "@/core/database/prisma";
import { registerBusiness, RegistrationError } from "@/core/onboarding/register-business";
import { TRIAL_DAYS } from "@/core/platform/subscription-lifecycle";
import { SUBSCRIPTION_SELECT, businessHasFeature } from "@/core/platform/subscription-plans";

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
          include: { business: { include: { branches: { include: { scheduleRules: true, staffAssignments: true } } } } },
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
    expect(branch.staffAssignments).toHaveLength(1);
    expect(branch.scheduleRules).toHaveLength(7);
  });

  it("starts the new business on a premium trial that runs out", async () => {
    const suffix = randomUUID();
    const phone = `+9929${suffix.replace(/-/g, "").replace(/\D/g, "").padEnd(8, "3").slice(0, 8)}`;
    phones.push(phone);
    const before = Date.now();

    const result = await registerBusiness({
      ownerName: "Далер",
      phone,
      password: "safe-password-123",
      businessName: `Барбершоп ${suffix}`,
    });
    businessIds.push(result.businessId);

    const business = await prisma.business.findUniqueOrThrow({
      where: { id: result.businessId },
      select: SUBSCRIPTION_SELECT,
    });
    expect(business.subscriptionPlan).toBe("PREMIUM");
    expect(business.subscriptionStatus).toBe("TRIALING");
    // The trial has to end: a null end date is the "never expires" grant, and handing it to every
    // registration would give the whole product away for good.
    expect(business.subscriptionEndsAt).not.toBeNull();
    expect(business.subscriptionEndsAt!.getTime()).toBeGreaterThanOrEqual(before + TRIAL_DAYS * 86_400_000);
    expect(business.subscriptionEndsAt!.getTime()).toBeLessThanOrEqual(Date.now() + TRIAL_DAYS * 86_400_000);
    expect(businessHasFeature(business, "SMS")).toBe(true);
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
    // Counting every business in the database makes this assertion depend on what other test files
    // happen to be creating at the same moment, which reddens CI at random. Only this test's own
    // registrations can tell us whether the rejected one rolled back.
    const ownBusinesses = { memberships: { some: { user: { phone } } } };
    const before = await prisma.business.count({ where: ownBusinesses });

    await expect(registerBusiness({ ...input, businessName: "Second Business" }))
      .rejects.toBeInstanceOf(RegistrationError);
    await expect(prisma.business.count({ where: ownBusinesses })).resolves.toBe(before);
  });
});
