import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { runDataRetention } from "@/core/maintenance/data-retention";
import { prisma } from "@/core/database/prisma";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

/**
 * Retention has two ways to be wrong, and only one of them is loud. Keeping everything fills a disk
 * slowly; deleting the wrong thing destroys the answer to "was this visit paid for" — so the cases that
 * matter most here are the rows the sweep must refuse to touch.
 */

const NOW = new Date("2026-08-06T10:00:00.000Z");
const LONG_AGO = new Date("2025-01-01T10:00:00.000Z");
const RECENT = new Date("2026-08-05T10:00:00.000Z");

const businessIds: string[] = [];
const userIds: string[] = [];

describe("data retention", () => {
  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  });

  it("sweeps settled delivery rows and leaves recent and unsent ones alone", async () => {
    const context = await setup();

    const stale = await message(context, "SENT", LONG_AGO, "BOOKING_REMINDER");
    const recent = await message(context, "SENT", RECENT, "BOOKING_CONFIRMATION");
    const scheduled = await message(context, "SCHEDULED", LONG_AGO, "REVIEW_REQUEST");

    const swept = await runDataRetention(NOW);

    expect(swept).toBeGreaterThanOrEqual(1);
    await expect(prisma.message.findUnique({ where: { id: stale.id } })).resolves.toBeNull();
    // A message still waiting to go out is work, not history, however old the row is.
    await expect(prisma.message.findUnique({ where: { id: scheduled.id } })).resolves.not.toBeNull();
    await expect(prisma.message.findUnique({ where: { id: recent.id } })).resolves.not.toBeNull();
  });

  it("takes a settled notification's deliveries with it and keeps the booking", async () => {
    const context = await setup();
    const identity = await prisma.businessTelegramIdentity.create({
      data: { membershipId: context.staff.membershipId!, telegramUserId: `tg-${randomUUID().slice(0, 8)}` },
    });
    const chat = await prisma.businessTelegramChat.create({
      data: { telegramIdentityId: identity.id, chatId: `-100${Date.now()}`, chatType: "GROUP" },
    });
    const notification = await prisma.businessNotification.create({
      data: {
        businessId: context.business.id,
        bookingId: context.bookingId,
        kind: "NEW_BOOKING",
        deduplicationKey: `retention-${randomUUID()}`,
        status: "SENT",
        scheduledAt: LONG_AGO,
        createdAt: LONG_AGO,
        deliveries: { create: { destinationId: chat.id, status: "SENT", scheduledAt: LONG_AGO, createdAt: LONG_AGO } },
      },
    });

    await runDataRetention(NOW);

    await expect(prisma.businessNotification.findUnique({ where: { id: notification.id } })).resolves.toBeNull();
    await expect(prisma.businessNotificationDelivery.count({ where: { notificationId: notification.id } })).resolves.toBe(0);
    await expect(prisma.booking.findUnique({ where: { id: context.bookingId } })).resolves.not.toBeNull();
  });

  it("never deletes what the business may be asked about later", async () => {
    const context = await setup();
    await prisma.auditEvent.create({
      data: { businessId: context.business.id, bookingId: context.bookingId, type: "booking.created", actorType: "customer", metadata: {}, createdAt: LONG_AGO },
    });
    const submission = await prisma.receiptSubmission.create({
      data: {
        businessId: context.business.id,
        paymentId: context.paymentId,
        storageKey: `receipts/${randomUUID()}.jpg`,
        contentType: "image/jpeg",
        sizeBytes: 1_024,
        status: "ACCEPTED",
        createdAt: LONG_AGO,
      },
    });

    await runDataRetention(NOW);

    // Money and its paper trail outlive the cleanup job on purpose.
    await expect(prisma.auditEvent.count({ where: { businessId: context.business.id } })).resolves.toBeGreaterThan(0);
    await expect(prisma.receiptSubmission.findUnique({ where: { id: submission.id } })).resolves.not.toBeNull();
    await expect(prisma.payment.findUnique({ where: { id: context.paymentId } })).resolves.not.toBeNull();
  });

  it("drops webhook ids and expired callback tokens once their window has closed", async () => {
    const context = await setup();
    await prisma.inboundChannelUpdate.createMany({
      data: [
        { integrationId: context.integrationId, externalUpdateId: `old-${randomUUID()}`, status: "COMPLETED", receivedAt: LONG_AGO },
        { integrationId: context.integrationId, externalUpdateId: `new-${randomUUID()}`, status: "COMPLETED", receivedAt: RECENT },
      ],
    });
    const conversation = await prisma.conversation.create({
      data: { businessId: context.business.id, channel: "TELEGRAM", externalChatId: `chat-${randomUUID()}`, status: "ACTIVE" },
    });
    await prisma.conversationAction.createMany({
      data: [
        { businessId: context.business.id, conversationId: conversation.id, kind: "CONFIRM_BOOKING", payload: {}, expiresAt: LONG_AGO },
        { businessId: context.business.id, conversationId: conversation.id, kind: "CONFIRM_BOOKING", payload: {}, expiresAt: new Date("2026-08-07T10:00:00.000Z") },
      ],
    });

    await runDataRetention(NOW);

    // The recent webhook id has to stay: it is what makes a Telegram retry a duplicate rather than a
    // second booking.
    await expect(prisma.inboundChannelUpdate.count({ where: { integrationId: context.integrationId } })).resolves.toBe(1);
    await expect(prisma.conversationAction.count({ where: { conversationId: conversation.id } })).resolves.toBe(1);
  });
});

function message(
  context: Awaited<ReturnType<typeof setup>>,
  status: "SENT" | "SCHEDULED",
  createdAt: Date,
  kind: string,
) {
  return prisma.message.create({
    data: {
      businessId: context.business.id,
      bookingId: context.bookingId,
      channel: "TELEGRAM",
      kind,
      status,
      scheduledAt: createdAt,
      createdAt,
    },
  });
}

async function setup() {
  const fixture = await createBookingFixture();
  businessIds.push(fixture.business.id);
  const staffMembership = await prisma.membership.findUniqueOrThrow({ where: { id: fixture.staff.membershipId! } });
  userIds.push(staffMembership.userId);
  const customer = await prisma.customer.create({ data: { businessId: fixture.business.id, name: "Клиент", phone: `+9929${String(Date.now()).slice(-8)}` } });
  const booking = await prisma.booking.create({
    data: {
      businessId: fixture.business.id,
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      customerId: customer.id,
      startsAt: new Date("2026-08-02T05:00:00.000Z"),
      endsAt: new Date("2026-08-02T05:45:00.000Z"),
      status: "CONFIRMED",
      payment: { create: { businessId: fixture.business.id, amountDiram: 5_000, totalDiram: 5_000, status: "RECEIPT_ACCEPTED" } },
    },
    include: { payment: true },
  });
  const integration = await prisma.businessTelegramIntegration.create({
    data: {
      businessId: fixture.business.id,
      publicId: randomUUID(),
      botId: `bot-${randomUUID().slice(0, 8)}`,
      botUsername: `bot_${randomUUID().slice(0, 8)}`,
      botTokenEncrypted: "x",
      status: "ACTIVE",
      connectionMethod: "TOKEN",
    },
  });
  return { ...fixture, bookingId: booking.id, paymentId: booking.payment!.id, integrationId: integration.id };
}
