import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/core/database/prisma";
import { createPendingBooking } from "@/core/bookings/booking-service";
import { scheduleBusinessNotification } from "@/core/notifications/business-notification-service";
import { listBusinessTelegramDestinations } from "@/core/integrations/platform-chat-link";
import { isEligible, sendDueBusinessTelegramNotifications } from "@/jobs/send-business-telegram-notifications";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("business Telegram notification worker", () => {
  const businessIds: string[] = [];
  const userIds: string[] = [];

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  });

  it("delivers booking events to managers and assigned staff, but receipt review only to managers", async () => {
    const fixture = await createBookingFixture();
    businessIds.push(fixture.business.id);
    const booking = await createTestBooking(fixture, "+992900001101");
    const owner = await connectDestination(fixture.business.id, "OWNER", "owner-chat");
    const assigned = await connectDestination(fixture.business.id, "STAFF", "assigned-chat", fixture.staff.id);
    const other = await connectDestination(fixture.business.id, "STAFF", "other-chat");
    userIds.push(owner.userId, assigned.userId, other.userId);
    const destinations = await listBusinessTelegramDestinations(fixture.business.id);
    expect(destinations).toEqual(expect.arrayContaining([
      expect.objectContaining({ chatId: "assigned-chat", role: "STAFF", staffId: fixture.staff.id }),
    ]));
    expect(isEligible("NEW_BOOKING", fixture.staff.id, destinations.find(item => item.chatId === "assigned-chat")!)).toBe(true);
    const now = new Date("2026-07-29T09:00:00.000Z");
    await scheduleBusinessNotification({ businessId: fixture.business.id, bookingId: booking.bookingId, kind: "RECEIPT_NEEDS_REVIEW", deduplicationKey: "review", scheduledAt: now });
    const stored = await prisma.businessNotification.findFirstOrThrow({ where: { businessId: fixture.business.id, kind: "NEW_BOOKING" }, include: { booking: { include: { staff: true } } } });
    expect(stored.booking?.staff.id).toBe(fixture.staff.id);
    const delivered: Array<{ chatId: string; text: string }> = [];

    await sendDueBusinessTelegramNotifications(now, {
      sendMessage: async (chatId, text) => { delivered.push({ chatId, text }); },
    });
    expect(delivered.filter(item => item.text.includes("Новая запись")).map(item => item.chatId).sort())
      .toEqual(["assigned-chat", "owner-chat"]);
    expect(delivered.filter(item => item.text.includes("Чек требует проверки")).map(item => item.chatId))
      .toEqual(["owner-chat"]);
  });

  it("retries after five minutes and fails after the maximum attempts", async () => {
    const fixture = await createBookingFixture();
    businessIds.push(fixture.business.id);
    const booking = await createTestBooking(fixture, "+992900001102");
    const owner = await connectDestination(fixture.business.id, "OWNER", "retry-chat");
    userIds.push(owner.userId);
    const now = new Date("2026-07-29T09:00:00.000Z");
    const notification = await scheduleBusinessNotification({ businessId: fixture.business.id, bookingId: booking.bookingId, kind: "NEW_BOOKING", deduplicationKey: "retry", scheduledAt: now });
    const failing = { sendMessage: async () => { throw new Error("token-secret network error"); } };

    await sendDueBusinessTelegramNotifications(now, failing);
    let delivery = await prisma.businessNotificationDelivery.findFirstOrThrow({ where: { notificationId: notification!.id } });
    expect(delivery).toMatchObject({ status: "SCHEDULED", attempts: 1, lastError: "Telegram delivery failed" });
    expect(delivery.scheduledAt).toEqual(new Date(now.getTime() + 5 * 60_000));

    await prisma.businessNotificationDelivery.update({ where: { id: delivery.id }, data: { attempts: 2, scheduledAt: now } });
    await sendDueBusinessTelegramNotifications(now, failing);
    delivery = await prisma.businessNotificationDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(delivery).toMatchObject({ status: "FAILED", attempts: 3, lastError: "Telegram delivery failed" });
    expect(delivery.lastError).not.toContain("token-secret");
  });

  async function connectDestination(
    businessId: string,
    role: "OWNER" | "ADMIN" | "STAFF",
    chatId: string,
    staffId?: string,
  ) {
    const user = await prisma.user.create({ data: { displayName: role, email: `${randomUUID()}@example.test` } });
    const membership = await prisma.membership.create({ data: { businessId, userId: user.id, role } });
    if (staffId) await prisma.staffMember.update({ where: { id: staffId }, data: { membershipId: membership.id } });
    const identity = await prisma.businessTelegramIdentity.create({ data: { membershipId: membership.id, telegramUserId: `${chatId}-user` } });
    const destination = await prisma.businessTelegramChat.create({ data: { telegramIdentityId: identity.id, chatId, chatType: "PRIVATE" } });
    return { userId: user.id, destinationId: destination.id };
  }

  async function createTestBooking(fixture: Awaited<ReturnType<typeof createBookingFixture>>, phone: string) {
    return createPendingBooking({
      businessSlug: fixture.business.slug,
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      resourceIds: [],
      startsAt: new Date("2026-08-02T05:00:00.000Z"),
      customer: { name: "Клиент", phone },
    }, new Date("2026-07-29T08:00:00.000Z"));
  }
});
