import type { Prisma } from "@/generated/prisma/client";

import { bookingScopeWhere, requireBookingAccess } from "@/core/booking-operations/booking-access";
import { BookingOperationError } from "@/core/booking-operations/booking-operation-error";
import { prisma } from "@/core/database/prisma";
import { localDateTimeToUtc, todayInTimeZone } from "@/core/formatting/dushanbe-date";
import { getPaymentForReview, listPaymentsForReview } from "@/core/payments/payment-review-service";

export type BusinessBotQueryActor = {
  businessId: string;
  userId: string;
};

export type BusinessBotBookingFilter = {
  kind: "today" | "upcoming" | "pending";
  limit?: number;
};

const bookingInclude = {
  branch: { select: { id: true, name: true, timeZone: true } },
  customer: { select: { id: true, name: true, phone: true, telegramChatId: true } },
  service: { select: { id: true, name: true, durationMinutes: true, amountDiram: true } },
  staff: { select: { id: true, displayName: true } },
  payment: { select: { id: true, status: true, amountDiram: true, isBankVerified: true } },
} satisfies Prisma.BookingInclude;

export async function getBusinessBotSummary(actor: BusinessBotQueryActor, now = new Date()) {
  const scope = await requireBookingAccess({ businessId: actor.businessId, actorUserId: actor.userId });
  const scoped = bookingScopeWhere(scope);
  const today = await todayWhere(actor.businessId, now);
  const [todayCount, pendingPaymentCount, needsAttentionCount, integration] = await Promise.all([
    prisma.booking.count({ where: { ...scoped, ...today } }),
    prisma.booking.count({ where: { ...scoped, status: "PENDING_PAYMENT" } }),
    prisma.booking.count({
      where: {
        ...scoped,
        payment: { status: "NEEDS_ATTENTION", submissions: { some: { status: "NEEDS_REVIEW" } } },
      },
    }),
    prisma.businessTelegramIntegration.findFirst({
      where: { businessId: actor.businessId },
      select: { status: true, botUsername: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return {
    todayCount,
    pendingPaymentCount,
    needsAttentionCount,
    customerBotStatus: integration?.status ?? "DISCONNECTED",
    customerBotUsername: integration?.status === "ACTIVE" ? integration.botUsername : null,
  };
}

export async function listBusinessBotBookings(
  actor: BusinessBotQueryActor,
  filter: BusinessBotBookingFilter,
  cursor: string | null = null,
  now = new Date(),
) {
  const scope = await requireBookingAccess({ businessId: actor.businessId, actorUserId: actor.userId });
  const limit = Math.min(Math.max(filter.limit ?? 10, 1), 20);
  const where: Prisma.BookingWhereInput = {
    ...bookingScopeWhere(scope),
    ...(filter.kind === "today" ? await todayWhere(actor.businessId, now) : {}),
    ...(filter.kind === "upcoming" ? {
      startsAt: { gte: now },
      status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
    } : {}),
    ...(filter.kind === "pending" ? { status: "PENDING_PAYMENT" } : {}),
  };
  const rows = await prisma.booking.findMany({
    where,
    include: bookingInclude,
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    items,
    nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
  };
}

export async function getBusinessBotBooking(actor: BusinessBotQueryActor, bookingId: string) {
  const scope = await requireBookingAccess({ businessId: actor.businessId, actorUserId: actor.userId });
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, ...bookingScopeWhere(scope) },
    include: bookingInclude,
  });
  if (!booking) throw new BookingOperationError("NOT_FOUND");
  return booking;
}

export async function listBusinessBotPaymentReviews(
  actor: BusinessBotQueryActor,
  cursor: string | null = null,
  limit = 10,
) {
  const pageSize = Math.min(Math.max(limit, 1), 20);
  const rows = await listPaymentsForReview({
    businessId: actor.businessId,
    actorUserId: actor.userId,
  }, { cursor, limit: pageSize + 1 });
  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  return {
    items: page.map(safePaymentReview),
    nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
  };
}

export async function getBusinessBotPaymentReview(actor: BusinessBotQueryActor, paymentId: string) {
  const payment = await getPaymentForReview({
    businessId: actor.businessId,
    actorUserId: actor.userId,
    paymentId,
  });
  return safePaymentReview(payment);
}

async function todayWhere(businessId: string, now: Date): Promise<Prisma.BookingWhereInput> {
  const branches = await prisma.branch.findMany({
    where: { businessId, archivedAt: null },
    select: { id: true, timeZone: true },
  });
  return {
    OR: branches.map((branch) => {
      const date = todayInTimeZone(branch.timeZone, now);
      return {
        branchId: branch.id,
        startsAt: {
          gte: localDateTimeToUtc(date, "00:00", branch.timeZone),
          lt: localDateTimeToUtc(nextDate(date), "00:00", branch.timeZone),
        },
      };
    }),
  };
}

function nextDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function safePaymentReview(payment: Awaited<ReturnType<typeof getPaymentForReview>>) {
  return {
    id: payment.id,
    status: payment.status,
    amountDiram: payment.amountDiram,
    receiptAmountDiram: payment.receiptAmountDiram,
    recipientCardLast4: payment.recipientCardSuffix?.slice(-4) ?? null,
    expectedCardLast4: payment.booking.branch.recipientCardLast4?.slice(-4) ?? null,
    attentionReason: payment.attentionReason,
    reviewReason: payment.reviewReason,
    reviewedAt: payment.reviewedAt,
    updatedAt: payment.updatedAt,
    hasReceipt: payment.submissions.length > 0,
    booking: payment.booking,
  };
}
