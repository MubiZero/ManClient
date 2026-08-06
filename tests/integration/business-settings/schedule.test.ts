import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getAvailableStarts } from "@/core/availability/availability-service";
import {
  replaceBranchSchedule,
  replaceStaffSchedule,
  upsertScheduleException,
} from "@/core/business-settings/schedule-service";
import { prisma } from "@/core/database/prisma";
import { registerBusiness } from "@/core/onboarding/register-business";

describe("editable business schedules", () => {
  const businessIds: string[] = [];
  const userIds: string[] = [];
  let businessId: string;
  let actorUserId: string;
  let branchId: string;
  let staffId: string;
  let serviceId: string;

  beforeEach(async () => {
    const suffix = randomUUID().replace(/\D/g, "").padEnd(8, "8").slice(0, 8);
    const registered = await registerBusiness({ ownerName: "Владелец", phone: `+9929${suffix}`, password: "safe-password", businessName: "Салон" });
    businessId = registered.businessId;
    actorUserId = registered.userId;
    businessIds.push(businessId);
    userIds.push(actorUserId);
    const branch = await prisma.branch.findFirstOrThrow({ where: { businessId } });
    const staff = await prisma.staffMember.findFirstOrThrow({ where: { businessId } });
    const service = await prisma.service.create({ data: { branchId: branch.id, name: "Стрижка", durationMinutes: 30, amountDiram: 5_000, isPublished: true, staffMembers: { connect: { id: staff.id } } } });
    branchId = branch.id;
    staffId = staff.id;
    serviceId = service.id;
  });

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  });

  it("uses staff hours instead of branch defaults", async () => {
    await replaceStaffSchedule({
      businessId,
      actorUserId,
      branchId,
      staffId,
      rules: [{ dayOfWeek: 1, startsAt: "12:00", endsAt: "16:00" }],
      breaks: [],
    });

    const starts = await availableOnMonday();
    expect(starts[0]).toEqual(new Date("2026-08-03T07:00:00.000Z"));
    expect(starts.at(-1)).toEqual(new Date("2026-08-03T10:30:00.000Z"));
  });

  it("subtracts configured breaks", async () => {
    await replaceBranchSchedule({
      businessId,
      actorUserId,
      branchId,
      rules: [{ dayOfWeek: 1, startsAt: "09:00", endsAt: "18:00" }],
      breaks: [{ dayOfWeek: 1, startsAt: "12:00", endsAt: "13:00" }],
    });

    const starts = await availableOnMonday();
    expect(starts).not.toContainEqual(new Date("2026-08-03T07:00:00.000Z"));
    expect(starts).not.toContainEqual(new Date("2026-08-03T07:30:00.000Z"));
  });

  it("uses a day-off exception before weekly working hours", async () => {
    await upsertScheduleException({
      businessId,
      actorUserId,
      branchId,
      staffId,
      startsAt: new Date("2026-08-02T19:00:00.000Z"),
      endsAt: new Date("2026-08-03T19:00:00.000Z"),
      available: false,
      note: "Выходной",
    });

    await expect(availableOnMonday()).resolves.toEqual([]);
  });

  async function availableOnMonday() {
    return getAvailableStarts({
      branchId,
      serviceId,
      staffId,
      resourceIds: [],
      rangeStartsAt: new Date("2026-08-02T19:00:00.000Z"),
      rangeEndsAt: new Date("2026-08-03T19:00:00.000Z"),
      durationMinutes: 30,
      intervalMinutes: 30,
      // Fixed dates need a fixed clock now that the booking policy refuses slots behind "now".
      now: new Date("2026-08-02T18:00:00.000Z"),
    });
  }
});
