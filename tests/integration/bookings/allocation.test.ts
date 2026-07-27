import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  BookingConflictError,
  reserveAllocation,
} from "@/core/bookings/booking-allocation";
import { prisma } from "@/core/database/prisma";

describe("reserveAllocation", () => {
  let branchId: string;
  let firstStaffId: string;
  let secondStaffId: string;
  let liftId: string;
  let secondLiftId: string;

  beforeEach(async () => {
    const suffix = randomUUID();
    const business = await prisma.business.create({
      data: {
        name: "Auto Service",
        slug: `auto-service-${suffix}`,
      },
    });
    const branch = await prisma.branch.create({
      data: {
        businessId: business.id,
        name: "Dushanbe",
        slug: "dushanbe",
      },
    });
    const firstUser = await prisma.user.create({
      data: { email: `first-${suffix}@example.test`, displayName: "First" },
    });
    const secondUser = await prisma.user.create({
      data: { email: `second-${suffix}@example.test`, displayName: "Second" },
    });
    const [firstMembership, secondMembership] = await Promise.all(
      [firstUser, secondUser].map((user) =>
        prisma.membership.create({
          data: { businessId: business.id, userId: user.id, role: "STAFF" },
        }),
      ),
    );
    const [firstStaff, secondStaff, lift, secondLift] = await Promise.all([
      prisma.staffMember.create({
        data: { branchId: branch.id, membershipId: firstMembership.id, displayName: "First" },
      }),
      prisma.staffMember.create({
        data: { branchId: branch.id, membershipId: secondMembership.id, displayName: "Second" },
      }),
      prisma.resource.create({
        data: { branchId: branch.id, name: "Lift" },
      }),
      prisma.resource.create({
        data: { branchId: branch.id, name: "Second lift" },
      }),
    ]);

    branchId = branch.id;
    firstStaffId = firstStaff.id;
    secondStaffId = secondStaff.id;
    liftId = lift.id;
    secondLiftId = secondLift.id;
  });

  it("rejects an overlapping booking for the same lift", async () => {
    const startsAt = new Date("2026-08-01T05:00:00.000Z");

    await reserveAllocation({
      branchId,
      staffId: firstStaffId,
      resourceIds: [liftId],
      startsAt,
      durationMinutes: 60,
    });

    await expect(
      reserveAllocation({
        branchId,
        staffId: secondStaffId,
        resourceIds: [liftId],
        startsAt: new Date("2026-08-01T05:30:00.000Z"),
        durationMinutes: 60,
      }),
    ).rejects.toEqual(new BookingConflictError("RESOURCE_UNAVAILABLE"));
  });

  it("allows simultaneous bookings on different lifts for different staff", async () => {
    const startsAt = new Date("2026-08-01T05:00:00.000Z");

    await reserveAllocation({
      branchId,
      staffId: firstStaffId,
      resourceIds: [liftId],
      startsAt,
      durationMinutes: 60,
    });

    await expect(
      reserveAllocation({
        branchId,
        staffId: secondStaffId,
        resourceIds: [secondLiftId],
        startsAt,
        durationMinutes: 60,
      }),
    ).resolves.toMatchObject({ status: "PENDING_PAYMENT" });
  });

  it("reserves a barber slot without a resource", async () => {
    await expect(
      reserveAllocation({
        branchId,
        staffId: firstStaffId,
        resourceIds: [],
        startsAt: new Date("2026-08-01T07:00:00.000Z"),
        durationMinutes: 30,
      }),
    ).resolves.toMatchObject({ resources: [] });
  });
});
