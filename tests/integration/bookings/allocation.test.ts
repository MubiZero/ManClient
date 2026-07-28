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
  let serviceId: string;
  let customerId: string;

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
    const [firstStaff, secondStaff, lift, secondLift, customer] = await Promise.all([
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
      prisma.customer.create({
        data: { businessId: business.id, name: "Customer", phone: `+992${suffix.slice(0, 9)}` },
      }),
    ]);
    const service = await prisma.service.create({
      data: {
        branchId: branch.id,
        name: "Service",
        durationMinutes: 60,
        amountDiram: 5_000,
        staffMembers: { connect: [{ id: firstStaff.id }, { id: secondStaff.id }] },
      },
    });

    branchId = branch.id;
    firstStaffId = firstStaff.id;
    secondStaffId = secondStaff.id;
    liftId = lift.id;
    secondLiftId = secondLift.id;
    serviceId = service.id;
    customerId = customer.id;
  });

  it("rejects an overlapping booking for the same lift", async () => {
    const startsAt = new Date("2026-08-01T05:00:00.000Z");

    await reserveAllocation({
      branchId,
      staffId: firstStaffId,
      serviceId,
      customerId,
      resourceIds: [liftId],
      startsAt,
      durationMinutes: 60,
      expiresAt: new Date("2026-08-01T04:15:00.000Z"),
      amountDiram: 5_000,
    });

    await expect(
      reserveAllocation({
        branchId,
        staffId: secondStaffId,
        serviceId,
        customerId,
        resourceIds: [liftId],
        startsAt: new Date("2026-08-01T05:30:00.000Z"),
        durationMinutes: 60,
        expiresAt: new Date("2026-08-01T04:15:00.000Z"),
        amountDiram: 5_000,
      }),
    ).rejects.toEqual(new BookingConflictError("RESOURCE_UNAVAILABLE"));
  });

  it("allows simultaneous bookings on different lifts for different staff", async () => {
    const startsAt = new Date("2026-08-01T05:00:00.000Z");

    await reserveAllocation({
      branchId,
      staffId: firstStaffId,
      serviceId,
      customerId,
      resourceIds: [liftId],
      startsAt,
      durationMinutes: 60,
      expiresAt: new Date("2026-08-01T04:15:00.000Z"),
      amountDiram: 5_000,
    });

    await expect(
      reserveAllocation({
        branchId,
        staffId: secondStaffId,
        serviceId,
        customerId,
        resourceIds: [secondLiftId],
        startsAt,
        durationMinutes: 60,
        expiresAt: new Date("2026-08-01T04:15:00.000Z"),
        amountDiram: 5_000,
      }),
    ).resolves.toMatchObject({ status: "PENDING_PAYMENT" });
  });

  it("reserves a barber slot without a resource", async () => {
    await expect(
      reserveAllocation({
        branchId,
        staffId: firstStaffId,
        serviceId,
        customerId,
        resourceIds: [],
        startsAt: new Date("2026-08-01T07:00:00.000Z"),
        durationMinutes: 30,
        expiresAt: new Date("2026-08-01T06:15:00.000Z"),
        amountDiram: 5_000,
      }),
    ).resolves.toMatchObject({ resources: [] });
  });

  it("rejects a customer from another business", async () => {
    const otherBusiness = await prisma.business.create({
      data: { name: "Other", slug: `other-${randomUUID()}` },
    });
    const otherCustomer = await prisma.customer.create({
      data: { businessId: otherBusiness.id, name: "Other", phone: "+992911111111" },
    });

    await expect(
      reserveAllocation({
        branchId,
        staffId: firstStaffId,
        serviceId,
        customerId: otherCustomer.id,
        resourceIds: [],
        startsAt: new Date("2026-08-01T08:00:00.000Z"),
        durationMinutes: 30,
        expiresAt: new Date("2026-08-01T07:15:00.000Z"),
        amountDiram: 5_000,
      }),
    ).rejects.toThrow("Customer does not belong to business");
  });
});
