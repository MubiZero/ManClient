import { describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import { cancelBooking } from "@/core/bookings/cancel-booking";
import { cancelWaitlistEntry, joinWaitlist, listWaitlistEntries, notifyWaitlistForFreedSlot } from "@/core/bookings/waitlist-service";
import { prisma } from "@/core/database/prisma";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

async function createWaitlistFixture() {
  const fixture = await createBookingFixture();
  await prisma.business.update({ where: { id: fixture.business.id }, data: { subscriptionPlan: "STANDARD" } });
  return fixture;
}

type Fixture = Awaited<ReturnType<typeof createWaitlistFixture>>;

/** Joins the waitlist and pins createdAt so ordering assertions do not depend on clock resolution. */
async function joinAt(fixture: Fixture, options: { phone: string; name?: string; staffId?: string | null; from?: string; to?: string; createdAt: string }) {
  const entry = await joinWaitlist({
    businessId: fixture.business.id,
    branchId: fixture.branch.id,
    serviceId: fixture.service.id,
    staffId: options.staffId === undefined ? fixture.staff.id : options.staffId,
    customer: { name: options.name ?? "Клиент", phone: options.phone },
    desiredFrom: new Date(options.from ?? "2026-08-02T00:00:00.000Z"),
    desiredTo: new Date(options.to ?? "2026-08-03T00:00:00.000Z"),
  });
  await prisma.waitlistEntry.update({ where: { id: entry.id }, data: { createdAt: new Date(options.createdAt) } });
  return entry;
}

describe("joinWaitlist", () => {
  it("creates a WAITING entry and upserts the customer by phone", async () => {
    const fixture = await createWaitlistFixture();

    const first = await joinAt(fixture, { phone: "+992900002211", name: "Мухаммад", createdAt: "2026-08-01T09:00:00.000Z" });
    const second = await joinAt(fixture, { phone: "992 90 000 22 11", name: "Мухаммад Р.", createdAt: "2026-08-01T09:05:00.000Z" });

    const customers = await prisma.customer.findMany({ where: { businessId: fixture.business.id, phone: "+992900002211" } });
    expect(customers).toHaveLength(1);
    expect(customers[0]!.name).toBe("Мухаммад Р.");

    const entries = await prisma.waitlistEntry.findMany({ where: { id: { in: [first.id, second.id] } } });
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.status === "WAITING" && entry.customerId === customers[0]!.id)).toBe(true);
    expect(entries.every((entry) => entry.notifiedAt === null)).toBe(true);
  });

  it("rejects when the business plan does not include the waitlist", async () => {
    const fixture = await createBookingFixture();

    await expect(
      joinWaitlist({
        businessId: fixture.business.id,
        branchId: fixture.branch.id,
        serviceId: fixture.service.id,
        staffId: fixture.staff.id,
        customer: { name: "Мухаммад", phone: "+992900002211" },
        desiredFrom: new Date("2026-08-02T00:00:00.000Z"),
        desiredTo: new Date("2026-08-03T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "PLAN_REQUIRED" });
  });

  it("rejects a malformed phone, a too-short name and an inverted window", async () => {
    const fixture = await createWaitlistFixture();
    const base = {
      businessId: fixture.business.id,
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      customer: { name: "Мухаммад", phone: "+992900002211" },
      desiredFrom: new Date("2026-08-02T00:00:00.000Z"),
      desiredTo: new Date("2026-08-03T00:00:00.000Z"),
    };

    await expect(joinWaitlist({ ...base, customer: { name: "Мухаммад", phone: "12345" } })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(joinWaitlist({ ...base, customer: { name: "М", phone: "+992900002211" } })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(joinWaitlist({ ...base, desiredTo: base.desiredFrom })).rejects.toMatchObject({ code: "INVALID_INPUT" });

    expect(await prisma.waitlistEntry.count({ where: { businessId: fixture.business.id } })).toBe(0);
  });
});

describe("notifyWaitlistForFreedSlot", () => {
  const freedSlot = { freedStartsAt: new Date("2026-08-02T05:00:00.000Z"), freedEndsAt: new Date("2026-08-02T05:45:00.000Z") };

  it("notifies at most three matching entries, oldest first", async () => {
    const fixture = await createWaitlistFixture();
    const entries = await Promise.all(
      ["09:00", "10:00", "11:00", "12:00"].map((time, index) =>
        joinAt(fixture, { phone: `+99290000${String(3300 + index).padStart(4, "0")}`, createdAt: `2026-08-01T${time}:00.000Z` }),
      ),
    );

    const notified = await notifyWaitlistForFreedSlot(
      { businessId: fixture.business.id, branchId: fixture.branch.id, serviceId: fixture.service.id, staffId: fixture.staff.id, ...freedSlot },
      prisma,
      new Date("2026-08-01T13:00:00.000Z"),
    );

    expect(notified).toBe(3);
    const stored = await prisma.waitlistEntry.findMany({ where: { id: { in: entries.map((entry) => entry.id) } }, orderBy: { createdAt: "asc" } });
    expect(stored.map((entry) => entry.status)).toEqual(["NOTIFIED", "NOTIFIED", "NOTIFIED", "WAITING"]);
    expect(stored.slice(0, 3).every((entry) => entry.notifiedAt?.toISOString() === "2026-08-01T13:00:00.000Z")).toBe(true);
    expect(stored[3]!.notifiedAt).toBeNull();
  });

  it("skips entries whose desired window does not cover the freed slot", async () => {
    const fixture = await createWaitlistFixture();
    // Window starts after the freed slot begins.
    const tooLate = await joinAt(fixture, { phone: "+992900003401", from: "2026-08-02T06:00:00.000Z", to: "2026-08-02T20:00:00.000Z", createdAt: "2026-08-01T09:00:00.000Z" });
    // Window ends before the freed slot finishes.
    const tooEarly = await joinAt(fixture, { phone: "+992900003402", from: "2026-08-02T00:00:00.000Z", to: "2026-08-02T05:30:00.000Z", createdAt: "2026-08-01T09:01:00.000Z" });
    const covering = await joinAt(fixture, { phone: "+992900003403", createdAt: "2026-08-01T09:02:00.000Z" });

    const notified = await notifyWaitlistForFreedSlot(
      { businessId: fixture.business.id, branchId: fixture.branch.id, serviceId: fixture.service.id, staffId: fixture.staff.id, ...freedSlot },
      prisma,
      new Date("2026-08-01T13:00:00.000Z"),
    );

    expect(notified).toBe(1);
    await expect(prisma.waitlistEntry.findUniqueOrThrow({ where: { id: covering.id } })).resolves.toMatchObject({ status: "NOTIFIED" });
    await expect(prisma.waitlistEntry.findUniqueOrThrow({ where: { id: tooLate.id } })).resolves.toMatchObject({ status: "WAITING" });
    await expect(prisma.waitlistEntry.findUniqueOrThrow({ where: { id: tooEarly.id } })).resolves.toMatchObject({ status: "WAITING" });
  });

  it("matches entries with no staff preference but not entries waiting for a different staff member", async () => {
    const fixture = await createWaitlistFixture();
    const otherStaff = await prisma.staffMember.create({
      data: { businessId: fixture.business.id, displayName: "Фаррух", branches: { create: { branchId: fixture.branch.id, isPrimary: true } } },
    });
    const anyStaff = await joinAt(fixture, { phone: "+992900003501", staffId: null, createdAt: "2026-08-01T09:00:00.000Z" });
    const otherStaffEntry = await joinAt(fixture, { phone: "+992900003502", staffId: otherStaff.id, createdAt: "2026-08-01T09:01:00.000Z" });

    const notified = await notifyWaitlistForFreedSlot(
      { businessId: fixture.business.id, branchId: fixture.branch.id, serviceId: fixture.service.id, staffId: fixture.staff.id, ...freedSlot },
      prisma,
      new Date("2026-08-01T13:00:00.000Z"),
    );

    expect(notified).toBe(1);
    await expect(prisma.waitlistEntry.findUniqueOrThrow({ where: { id: anyStaff.id } })).resolves.toMatchObject({ status: "NOTIFIED" });
    await expect(prisma.waitlistEntry.findUniqueOrThrow({ where: { id: otherStaffEntry.id } })).resolves.toMatchObject({ status: "WAITING" });
  });

  it("is triggered when a booking is cancelled and frees the slot", async () => {
    const fixture = await createWaitlistFixture();
    const waiting = await joinAt(fixture, { phone: "+992900003601", createdAt: "2026-08-01T09:00:00.000Z" });
    const pending = await createPendingBooking(
      {
        businessSlug: fixture.business.slug,
        branchId: fixture.branch.id,
        serviceId: fixture.service.id,
        staffId: fixture.staff.id,
        resourceIds: [],
        startsAt: new Date("2026-08-02T05:00:00.000Z"),
        customer: { name: "Мухаммад", phone: "+992900001122" },
      },
      new Date("2026-08-01T04:00:00.000Z"),
    );
    const customer = await prisma.customer.findFirstOrThrow({ where: { businessId: fixture.business.id, phone: "+992900001122" } });

    await cancelBooking({ bookingId: pending.bookingId, actor: { type: "customer", customerId: customer.id } }, new Date("2026-08-01T04:10:00.000Z"));

    await expect(prisma.waitlistEntry.findUniqueOrThrow({ where: { id: waiting.id } })).resolves.toMatchObject({
      status: "NOTIFIED",
      notifiedAt: new Date("2026-08-01T04:10:00.000Z"),
    });
  });
});

describe("listWaitlistEntries and cancelWaitlistEntry", () => {
  it("lists entries newest first with branch, service and customer resolved", async () => {
    const fixture = await createWaitlistFixture();
    await joinAt(fixture, { phone: "+992900003701", name: "Первый", createdAt: "2026-08-01T09:00:00.000Z" });
    await joinAt(fixture, { phone: "+992900003702", name: "Второй", createdAt: "2026-08-01T10:00:00.000Z" });

    const { items, nextCursor } = await listWaitlistEntries(fixture.business.id);

    expect(nextCursor).toBeNull();
    expect(items.map((item) => item.customerName)).toEqual(["Второй", "Первый"]);
    expect(items[0]).toMatchObject({
      branchName: fixture.branch.name,
      serviceName: fixture.service.name,
      customerPhone: "+992900003702",
      status: "WAITING",
    });
  });

  it("cancels a waiting entry and refuses entries from another business or already cancelled", async () => {
    const fixture = await createWaitlistFixture();
    const other = await createWaitlistFixture();
    const entry = await joinAt(fixture, { phone: "+992900003801", createdAt: "2026-08-01T09:00:00.000Z" });

    await cancelWaitlistEntry({ businessId: fixture.business.id, waitlistEntryId: entry.id });
    await expect(prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } })).resolves.toMatchObject({ status: "CANCELLED" });

    await expect(cancelWaitlistEntry({ businessId: fixture.business.id, waitlistEntryId: entry.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(cancelWaitlistEntry({ businessId: other.business.id, waitlistEntryId: entry.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

/**
 * Delivery used to happen inline: a Telegram call inside the caller's cancellation transaction,
 * with failures swallowed. That left entries marked NOTIFIED with nothing ever sent and no retry,
 * so notification now goes on the Message queue like every other outbound message.
 */
describe("waitlist notification queueing", () => {
  const freedSlot = { freedStartsAt: new Date("2026-08-02T05:00:00.000Z"), freedEndsAt: new Date("2026-08-02T05:45:00.000Z") };

  async function notifyOne(fixture: Fixture, options: { telegram?: boolean; sms?: boolean } = {}) {
    const entry = await joinAt(fixture, { phone: "+992900004401", createdAt: "2026-08-01T09:00:00.000Z" });
    if (options.telegram) {
      const stored = await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } });
      await prisma.customer.update({ where: { id: stored.customerId }, data: { telegramChatId: `chat-${entry.id}` } });
    }
    if (options.sms) {
      await prisma.business.update({ where: { id: fixture.business.id }, data: { smsNotificationsEnabled: true } });
    }
    await notifyWaitlistForFreedSlot(
      { businessId: fixture.business.id, branchId: fixture.branch.id, serviceId: fixture.service.id, staffId: fixture.staff.id, ...freedSlot },
      prisma,
      new Date("2026-08-01T13:00:00.000Z"),
    );
    return entry;
  }

  it("queues a Telegram message and records the slot the message will name", async () => {
    const fixture = await createWaitlistFixture();
    const entry = await notifyOne(fixture, { telegram: true });

    const messages = await prisma.message.findMany({ where: { waitlistEntryId: entry.id } });
    expect(messages.map((message) => `${message.channel}:${message.kind}`)).toEqual(["TELEGRAM:WAITLIST_SLOT_FREED"]);
    expect(messages[0]!.bookingId).toBeNull();
    await expect(prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } })).resolves.toMatchObject({
      freedStartsAt: freedSlot.freedStartsAt,
    });
  });

  it("keeps a customer with Telegram off the paid channel even when SMS is available", async () => {
    const fixture = await createWaitlistFixture();
    const entry = await notifyOne(fixture, { telegram: true, sms: true });

    // A freed slot is worth telling somebody about once. Sending it twice used to cost an SMS on top
    // of a message the customer had already read.
    const messages = await prisma.message.findMany({ where: { waitlistEntryId: entry.id } });
    expect(messages.map((message) => message.channel)).toEqual(["TELEGRAM"]);
  });

  it("falls back to SMS for a customer with no Telegram", async () => {
    const fixture = await createWaitlistFixture();
    const entry = await notifyOne(fixture, { telegram: false, sms: true });

    const messages = await prisma.message.findMany({ where: { waitlistEntryId: entry.id } });
    expect(messages.map((message) => message.channel)).toEqual(["SMS"]);
  });

  it("does not queue SMS when the plan lacks the feature even with the toggle on", async () => {
    const fixture = await createWaitlistFixture();
    await prisma.business.update({ where: { id: fixture.business.id }, data: { subscriptionPlan: "STANDARD" } });
    const entry = await notifyOne(fixture, { telegram: true, sms: true });
    // STANDARD does include SMS, so drop to START to prove the gate rather than the toggle.
    await prisma.message.deleteMany({ where: { waitlistEntryId: entry.id } });
    await prisma.waitlistEntry.update({ where: { id: entry.id }, data: { status: "WAITING", freedStartsAt: null } });
    await prisma.business.update({ where: { id: fixture.business.id }, data: { subscriptionPlan: "START" } });

    await notifyWaitlistForFreedSlot(
      { businessId: fixture.business.id, branchId: fixture.branch.id, serviceId: fixture.service.id, staffId: fixture.staff.id, ...freedSlot },
      prisma,
      new Date("2026-08-01T13:00:00.000Z"),
    );

    const messages = await prisma.message.findMany({ where: { waitlistEntryId: entry.id } });
    expect(messages.map((message) => message.channel)).toEqual(["TELEGRAM"]);
  });

  it("still consumes a notify slot when the customer is reachable on no channel", async () => {
    const fixture = await createWaitlistFixture();
    const entry = await notifyOne(fixture);

    expect(await prisma.message.count({ where: { waitlistEntryId: entry.id } })).toBe(0);
    await expect(prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } })).resolves.toMatchObject({ status: "NOTIFIED" });
  });
});
