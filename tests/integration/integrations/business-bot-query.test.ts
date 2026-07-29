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
    const tokyoBranch = await prisma.branch.create({
      data: { businessId: fixture.businessId, name: "Tokyo", slug: `tokyo-${randomUUID()}`, timeZone: "Asia/Tokyo" },
    });
    const tokyoService = await prisma.service.create({
      data: { branchId: tokyoBranch.id, name: "Tokyo service", durationMinutes: 45, amountDiram: 5_000 },
    });
    await createBooking(fixture, fixture.primaryStaffId, "Нью-Йорк сегодня", "2026-07-29T03:00:00.000Z", "PENDING_PAYMENT");
    await createBooking(fixture, fixture.primaryStaffId, "Нью-Йорк завтра", "2026-07-29T05:00:00.000Z", "PENDING_PAYMENT");
    await createBooking(fixture, fixture.primaryStaffId, "Токио сегодня", "2026-07-28T16:00:00.000Z", "PENDING_PAYMENT", {
      branchId: tokyoBranch.id,
      serviceId: tokyoService.id,
    });
    await createBooking(fixture, fixture.primaryStaffId, "Токио вчера", "2026-07-28T14:00:00.000Z", "PENDING_PAYMENT", {
      branchId: tokyoBranch.id,
      serviceId: tokyoService.id,
    });
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

    expect(today.items.map(({ customer }) => customer.name)).toEqual(["Токио сегодня", "Нью-Йорк сегодня"]);
    expect(summary).toMatchObject({ todayCount: 2, pendingPaymentCount: 4, customerBotStatus: "DISCONNECTED" });
  });

  it("paginates equal start times in deterministic startsAt and id order without gaps", async () => {
    const fixture = await createWorkspace();
    const created = [];
    for (let index = 0; index < 5; index += 1) {
      created.push(await createBooking(
        fixture,
        fixture.primaryStaffId,
        `Клиент ${index + 1}`,
        "2026-07-29T08:00:00.000Z",
        "CONFIRMED",
      ));
    }
    created.push(await createBooking(fixture, fixture.primaryStaffId, "Клиент 6", "2026-07-29T09:00:00.000Z", "CONFIRMED"));
    const actor = { businessId: fixture.businessId, userId: fixture.ownerUserId };
    const now = new Date("2026-07-29T07:00:00.000Z");

    const pages = [];
    let cursor: string | null = null;
    do {
      const page = await listBusinessBotBookings(actor, { kind: "upcoming", limit: 2 }, cursor, now);
      pages.push(page);
      cursor = page.nextCursor;
    } while (cursor);
    const actualIds = pages.flatMap(page => page.items.map(({ id }) => id));
    const expectedIds = [...created]
      .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime() || left.id.localeCompare(right.id))
      .map(({ id }) => id);

    expect(pages.map(page => page.items.length)).toEqual([2, 2, 2]);
    expect(pages.at(-1)?.nextCursor).toBeNull();
    expect(actualIds).toEqual(expectedIds);
    expect(new Set(actualIds).size).toBe(created.length);
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
    location: { branchId: string; serviceId: string } = {
      branchId: workspace.branchId,
      serviceId: workspace.serviceId,
    },
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
        branchId: location.branchId,
        serviceId: location.serviceId,
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
