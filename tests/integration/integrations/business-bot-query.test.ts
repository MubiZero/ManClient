import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import {
  getBusinessBotBooking,
  getBusinessBotSummary,
  listBusinessBotBookings,
} from "@/core/integrations/business-bot-query-service";
import { prisma } from "@/core/database/prisma";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("business bot booking queries", () => {
  const businessIds: string[] = [];
  const userIds: string[] = [];

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  });

  it("scopes owner and staff results to their business role", async () => {
    const fixture = await createWorkspace();
    const other = await createWorkspace();
    await createBooking(fixture, fixture.primaryStaffId, "Владелец видит", "2026-07-29T08:00:00.000Z", "PENDING_PAYMENT");
    const colleagueBooking = await createBooking(fixture, fixture.colleagueStaffId, "Коллега", "2026-07-29T09:00:00.000Z", "CONFIRMED");
    await createBooking(other, other.primaryStaffId, "Другой бизнес", "2026-07-29T10:00:00.000Z", "CONFIRMED");

    const owner = await listBusinessBotBookings(
      { businessId: fixture.businessId, userId: fixture.ownerUserId },
      { kind: "upcoming", limit: 10 },
      null,
      new Date("2026-07-29T07:00:00.000Z"),
    );
    const staff = await listBusinessBotBookings(
      { businessId: fixture.businessId, userId: fixture.staffUserId },
      { kind: "upcoming", limit: 10 },
      null,
      new Date("2026-07-29T07:00:00.000Z"),
    );

    expect(owner.items.map(({ customer }) => customer.name)).toEqual(["Владелец видит", "Коллега"]);
    expect(staff.items.map(({ customer }) => customer.name)).toEqual(["Владелец видит"]);
    await expect(getBusinessBotBooking(
      { businessId: fixture.businessId, userId: fixture.staffUserId },
      colleagueBooking.id,
    )).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("uses every branch timezone when resolving today's dashboard", async () => {
    const fixture = await createWorkspace("America/New_York");
    await createBooking(fixture, fixture.primaryStaffId, "Ещё сегодня", "2026-07-29T03:00:00.000Z", "PENDING_PAYMENT");
    await createBooking(fixture, fixture.primaryStaffId, "Уже завтра", "2026-07-29T05:00:00.000Z", "PENDING_PAYMENT");
    const now = new Date("2026-07-29T02:00:00.000Z");

    const today = await listBusinessBotBookings(
      { businessId: fixture.businessId, userId: fixture.ownerUserId },
      { kind: "today", limit: 10 },
      null,
      now,
    );
    const summary = await getBusinessBotSummary(
      { businessId: fixture.businessId, userId: fixture.ownerUserId },
      now,
    );

    expect(today.items.map(({ customer }) => customer.name)).toEqual(["Ещё сегодня"]);
    expect(summary).toMatchObject({ todayCount: 1, pendingPaymentCount: 2, customerBotStatus: "DISCONNECTED" });
  });

  it("paginates a stable booking order without duplicates", async () => {
    const fixture = await createWorkspace();
    for (const [index, hour] of ["08", "08", "09", "10"].entries()) {
      await createBooking(
        fixture,
        fixture.primaryStaffId,
        `Клиент ${index + 1}`,
        `2026-07-29T${hour}:${index === 1 ? "00" : "30"}:00.000Z`,
        "CONFIRMED",
      );
    }
    const actor = { businessId: fixture.businessId, userId: fixture.ownerUserId };
    const now = new Date("2026-07-29T07:00:00.000Z");

    const first = await listBusinessBotBookings(actor, { kind: "upcoming", limit: 2 }, null, now);
    const second = await listBusinessBotBookings(actor, { kind: "upcoming", limit: 2 }, first.nextCursor, now);

    expect(first.nextCursor).toBeTruthy();
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map(({ id }) => id)).size).toBe(4);
    expect([...first.items, ...second.items].map(({ customer }) => customer.name).sort()).toEqual([
      "Клиент 1", "Клиент 2", "Клиент 3", "Клиент 4",
    ]);
  });

  async function createWorkspace(timeZone = "Asia/Dushanbe") {
    const fixture = await createBookingFixture();
    businessIds.push(fixture.business.id);
    await prisma.branch.update({ where: { id: fixture.branch.id }, data: { timeZone } });
    const staffMembership = await prisma.membership.findUniqueOrThrow({ where: { id: fixture.staff.membershipId! } });
    userIds.push(staffMembership.userId);
    const owner = await prisma.user.create({ data: { email: `bot-owner-${randomUUID()}@example.test`, displayName: "Owner" } });
    const colleagueUser = await prisma.user.create({ data: { email: `bot-staff-${randomUUID()}@example.test`, displayName: "Colleague" } });
    userIds.push(owner.id, colleagueUser.id);
    await prisma.membership.create({ data: { businessId: fixture.business.id, userId: owner.id, role: "OWNER" } });
    const colleagueMembership = await prisma.membership.create({ data: { businessId: fixture.business.id, userId: colleagueUser.id, role: "STAFF" } });
    const colleague = await prisma.staffMember.create({
      data: { businessId: fixture.business.id, membershipId: colleagueMembership.id, displayName: "Colleague" },
    });
    return {
      businessId: fixture.business.id,
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      ownerUserId: owner.id,
      staffUserId: staffMembership.userId,
      primaryStaffId: fixture.staff.id,
      colleagueStaffId: colleague.id,
    };
  }

  async function createBooking(
    workspace: Awaited<ReturnType<typeof createWorkspace>>,
    staffId: string,
    customerName: string,
    startsAt: string,
    status: "PENDING_PAYMENT" | "CONFIRMED",
  ) {
    const start = new Date(startsAt);
    const suffix = randomUUID();
    const customer = await prisma.customer.create({
      data: {
        businessId: workspace.businessId,
        name: customerName,
        phone: `+992${suffix.replace(/\D/g, "").padEnd(9, "0").slice(0, 9)}`,
      },
    });
    return prisma.booking.create({
      data: {
        businessId: workspace.businessId,
        branchId: workspace.branchId,
        serviceId: workspace.serviceId,
        staffId,
        customerId: customer.id,
        startsAt: start,
        endsAt: new Date(start.getTime() + 45 * 60_000),
        status,
        payment: { create: { businessId: workspace.businessId, amountDiram: 5_000 } },
      },
    });
  }
});
