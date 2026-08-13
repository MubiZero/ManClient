import type { Message, Prisma } from "@/generated/prisma/client";

import { nextChannelAfter } from "@/core/notifications/channel-ladder";
import { defaultDependencies, type DeliveryTarget } from "@/core/notifications/delivery";
import { SENDERS } from "@/core/notifications/senders";
import { prisma } from "@/core/database/prisma";
import { errorText, logger } from "@/core/observability/logger";
import { reportError } from "@/core/observability/report-error";

type DeliverableMessage = Prisma.MessageGetPayload<{
  include: {
    booking: { include: { customer: true; payment: true; business: { include: { telegramIntegrations: true } }; service: true; branch: true } };
    waitlistEntry: { include: { customer: true; business: { include: { telegramIntegrations: true } }; service: true; branch: true } };
  };
}>;

/**
 * Sends what is due, one channel per message, and hands a message down the ladder when its channel
 * turns out not to be able to carry it. The channels themselves live in core/notifications/senders —
 * this job owns claiming, retrying and escalating, and knows nothing about how a Telegram message
 * differs from an SMS.
 *
 * `scope` narrows the sweep to a single business — see expire-pending-bookings.ts for why it exists.
 */
export async function sendDueBookingReminders(now = new Date(), dependencies = defaultDependencies, scope?: { businessId: string }) {
  const due = await prisma.message.findMany({
    where: { ...(scope ? { businessId: scope.businessId } : {}), status: "SCHEDULED", scheduledAt: { lte: now } },
    select: { id: true },
    orderBy: { scheduledAt: "asc" },
    take: 100,
  });
  let processed = 0;

  for (const candidate of due) {
    const claimed = await prisma.message.updateMany({
      where: { id: candidate.id, status: "SCHEDULED" },
      data: { status: "PROCESSING" },
    });
    if (claimed.count !== 1) continue;

    const message = await prisma.message.findUniqueOrThrow({
      where: { id: candidate.id },
      include: {
        booking: {
          include: {
            customer: true,
            payment: true,
            business: { include: { telegramIntegrations: { where: { status: "ACTIVE" }, take: 1 } } },
            service: true,
            branch: true,
          },
        },
        waitlistEntry: {
          include: {
            customer: true,
            business: { include: { telegramIntegrations: { where: { status: "ACTIVE" }, take: 1 } } },
            service: true,
            branch: true,
          },
        },
      },
    });
    const target = resolveTarget(message, now);
    if (!target) {
      // The news itself is stale — the booking was cancelled under it, the slot was taken. Nothing to
      // escalate: no channel would improve on saying nothing.
      await prisma.message.update({ where: { id: message.id }, data: { status: "SKIPPED" } });
      processed += 1;
      continue;
    }

    try {
      const outcome = await SENDERS[message.channel]({ kind: message.kind, target, now }, dependencies);
      if (!outcome.delivered) {
        await prisma.message.update({
          where: { id: message.id },
          data: { status: "SKIPPED", lastError: `${message.channel}: ${outcome.unavailable}`.slice(0, 500) },
        });
        await handDownTheLadder(message, target, outcome.unavailable, now);
      } else {
        await prisma.message.update({
          where: { id: message.id },
          data: { status: "SENT", attempts: { increment: 1 }, externalId: outcome.externalId },
        });
      }
    } catch (error) {
      const attempts = message.attempts + 1;
      const exhausted = attempts >= message.maxAttempts;
      await prisma.message.update({
        where: { id: message.id },
        data: {
          status: exhausted ? "FAILED" : "SCHEDULED",
          attempts,
          scheduledAt: exhausted ? message.scheduledAt : new Date(now.getTime() + 5 * 60_000),
          // The provider's own words for SMS and WhatsApp — a rejected payom template and an
          // unreachable gateway need different fixes, and this column is where support looks. Telegram
          // stays generic: its bot token travels in the request URL, so its errors are logged, not stored.
          lastError:
            message.channel === "TELEGRAM"
              ? "TELEGRAM delivery failed"
              : `${message.channel}: ${errorText(error)}`.slice(0, 500),
        },
      });
      const context = { messageId: message.id, businessId: message.businessId, channel: message.channel, kind: message.kind, attempts };
      if (exhausted) {
        reportError({ event: "message.delivery_failed", error, context, fingerprint: `message:${message.channel}:${message.kind}` });
        // A channel that has failed every attempt is a channel that is down, not a message that
        // cannot be sent. Somebody below it may still reach the customer in time.
        await handDownTheLadder(message, target, `exhausted after ${attempts} attempts`, now);
      } else {
        logger.warn("message.delivery_retrying", { ...context, error: errorText(error) });
      }
    }
    processed += 1;
  }

  return processed;
}

/**
 * Writes the same message for the next channel that could carry it. The row just closed keeps its own
 * status and error, so what was tried and why stays readable: a separate row per channel is both what
 * `[bookingId, channel, kind]` needs in order to keep a message from going twice, and the only way to
 * answer "the customer says nobody told them".
 */
async function handDownTheLadder(message: Message, target: DeliveryTarget, reason: string, now: Date): Promise<void> {
  const next = nextChannelAfter(message.channel, {
    kind: message.kind,
    customer: target.customer,
    business: target.business,
  });

  const context = { messageId: message.id, businessId: message.businessId, kind: message.kind, from: message.channel, reason };
  if (!next) {
    logger.warn("message.ladder_exhausted", context);
    return;
  }

  const identity = message.bookingId
    ? { bookingId_channel_kind: { bookingId: message.bookingId, channel: next, kind: message.kind } }
    : { waitlistEntryId_channel_kind: { waitlistEntryId: message.waitlistEntryId!, channel: next, kind: message.kind } };
  await prisma.message.upsert({
    where: identity,
    create: {
      businessId: message.businessId,
      bookingId: message.bookingId,
      waitlistEntryId: message.waitlistEntryId,
      channel: next,
      kind: message.kind,
      scheduledAt: now,
    },
    update: { status: "SCHEDULED", scheduledAt: now, attempts: 0, lastError: null },
  });
  logger.info("message.handed_down", { ...context, to: next });
}

/**
 * Most messages hang off a booking, but a freed-slot alert hangs off a waitlist entry and has no
 * booking at all. Both are flattened to the same shape here so the senders stay channel-shaped rather
 * than growing a second copy per source.
 *
 * Returns null when the message should no longer go out — the booking was cancelled under it, the
 * visit has already happened, the waitlist entry was taken or withdrawn. The caller marks those
 * SKIPPED rather than retrying them.
 */
function resolveTarget(message: DeliverableMessage, now: Date): DeliveryTarget | null {
  if (message.waitlistEntry) {
    const entry = message.waitlistEntry;
    // An entry that moved on (CONVERTED because they booked, CANCELLED because they withdrew) must
    // not be told the slot is free, and neither must anyone if the slot itself is now in the past.
    if (entry.status !== "NOTIFIED" || !entry.freedStartsAt || entry.freedStartsAt <= now) return null;
    return {
      bookingId: null,
      customer: entry.customer,
      business: entry.business,
      serviceName: entry.service.name,
      occursAt: entry.freedStartsAt,
      timeZone: entry.branch.timeZone,
    };
  }

  const booking = message.booking;
  if (!booking) return null;
  const eligible = message.kind === "PAYMENT_REMINDER"
    ? booking.status === "PENDING_PAYMENT" && booking.payment?.status === "PENDING"
    : message.kind === "BOOKING_CANCELLED"
      ? booking.status === "CANCELLED"
      : message.kind === "PAYMENT_REJECTED" || message.kind === "RECEIPT_NEEDS_REVIEW"
        ? booking.status === "PENDING_PAYMENT"
        : booking.status === "CONFIRMED";
  const visitMustBeFuture = ["BOOKING_REMINDER", "PAYMENT_REMINDER"].includes(message.kind);
  if (!eligible || (visitMustBeFuture && booking.startsAt <= now)) return null;

  return {
    bookingId: booking.id,
    customer: booking.customer,
    business: booking.business,
    serviceName: booking.service.name,
    occursAt: booking.startsAt,
    timeZone: booking.branch.timeZone,
  };
}
