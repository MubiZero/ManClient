import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/core/database/prisma";

describe("business settings schema", () => {
  const businessIds: string[] = [];

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
  });

  it("stores an active specialist without granting dashboard access", async () => {
    const business = await createBusiness();
    const branch = await prisma.branch.create({
      data: { businessId: business.id, name: "Центр", slug: "center" },
    });

    const staff = await prisma.staffMember.create({
      data: {
        businessId: business.id,
        displayName: "Фирдавс Каримов",
        branches: { create: { branchId: branch.id, isPrimary: true } },
      },
      include: { branches: true },
    });

    expect(staff.membershipId).toBeNull();
    expect(staff.archivedAt).toBeNull();
    expect(staff.branches).toEqual([
      expect.objectContaining({ branchId: branch.id, isPrimary: true }),
    ]);
  });

  it("stores branch details, resource availability and staff schedule", async () => {
    const business = await createBusiness();
    const branch = await prisma.branch.create({
      data: {
        businessId: business.id,
        name: "Сино",
        slug: "sino",
        address: "Рудаки, 42",
        phone: "+992900001122",
      },
    });
    const staff = await prisma.staffMember.create({
      data: {
        businessId: business.id,
        displayName: "Манижа Саидова",
        branches: { create: { branchId: branch.id, isPrimary: true } },
      },
    });
    const resource = await prisma.resource.create({
      data: {
        branchId: branch.id,
        name: "Подъёмник 1",
        kind: "LIFT",
        capacity: 1,
        isAvailable: true,
      },
    });
    const rule = await prisma.staffScheduleRule.create({
      data: {
        staffId: staff.id,
        branchId: branch.id,
        dayOfWeek: 1,
        startsAt: "09:00",
        endsAt: "18:00",
      },
    });

    expect(branch).toMatchObject({ address: "Рудаки, 42", phone: "+992900001122" });
    expect(resource).toMatchObject({ kind: "LIFT", capacity: 1, isAvailable: true });
    expect(rule).toMatchObject({ staffId: staff.id, branchId: branch.id, dayOfWeek: 1 });
  });

  async function createBusiness() {
    const business = await prisma.business.create({
      data: { name: "Тестовый бизнес", slug: `business-${randomUUID()}` },
    });
    businessIds.push(business.id);
    return business;
  }
});
