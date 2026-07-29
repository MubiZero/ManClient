import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { getAvailableStarts } from "@/core/availability/availability-service";
import { prisma } from "@/core/database/prisma";

describe("getAvailableStarts", () => {
  let branchId: string;
  let staffId: string;

  beforeEach(async () => {
    const suffix = randomUUID();
    const business = await prisma.business.create({
      data: { name: "Barber", slug: `barber-${suffix}` },
    });
    const branch = await prisma.branch.create({
      data: {
        businessId: business.id,
        name: "Dushanbe",
        slug: "dushanbe",
        scheduleRules: {
          create: { dayOfWeek: 6, startsAt: "09:00", endsAt: "10:00" },
        },
      },
    });
    const user = await prisma.user.create({
      data: { email: `barber-${suffix}@example.test`, displayName: "Barber" },
    });
    const membership = await prisma.membership.create({
      data: { businessId: business.id, userId: user.id, role: "STAFF" },
    });
    const staff = await prisma.staffMember.create({
      data: { businessId: business.id, membershipId: membership.id, displayName: "Barber", branches: { create: { branchId: branch.id, isPrimary: true } } },
    });

    branchId = branch.id;
    staffId = staff.id;
  });

  it("does not return a slot outside the branch schedule", async () => {
    await expect(
      getAvailableStarts({
        branchId,
        staffId,
        resourceIds: [],
        rangeStartsAt: new Date("2026-08-01T06:00:00.000Z"),
        rangeEndsAt: new Date("2026-08-01T07:00:00.000Z"),
        durationMinutes: 30,
        intervalMinutes: 30,
      }),
    ).resolves.toEqual([]);
  });

  it("returns half-hour slots inside the branch schedule", async () => {
    await expect(
      getAvailableStarts({
        branchId,
        staffId,
        resourceIds: [],
        rangeStartsAt: new Date("2026-08-01T04:00:00.000Z"),
        rangeEndsAt: new Date("2026-08-01T05:00:00.000Z"),
        durationMinutes: 30,
        intervalMinutes: 30,
      }),
    ).resolves.toEqual([
      new Date("2026-08-01T04:00:00.000Z"),
      new Date("2026-08-01T04:30:00.000Z"),
    ]);
  });
});
