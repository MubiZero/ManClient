import { prisma } from "@/core/database/prisma";
import { businessHasFeature } from "@/core/platform/subscription-plans";

export class ReviewError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "NOT_FOUND" | "ALREADY_SUBMITTED" | "PLAN_REQUIRED" | "FORBIDDEN") {
    super(code);
    this.name = "ReviewError";
  }
}

const PAGE_SIZE = 20;

export async function submitReview(input: { bookingId: string; customerId: string; rating: number; comment?: string }) {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new ReviewError("INVALID_INPUT");
  }
  const comment = input.comment?.trim().slice(0, 1000) || null;
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, businessId: true, customerId: true },
  });
  if (!booking || booking.customerId !== input.customerId) throw new ReviewError("NOT_FOUND");

  try {
    return await prisma.review.create({
      data: {
        businessId: booking.businessId,
        bookingId: booking.id,
        customerId: input.customerId,
        rating: input.rating,
        comment,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new ReviewError("ALREADY_SUBMITTED");
    throw error;
  }
}

export async function getAverageRating(businessId: string) {
  const [aggregate, business] = await Promise.all([
    prisma.review.aggregate({
      where: { businessId, isHidden: false },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.business.findUnique({ where: { id: businessId }, select: { subscriptionPlan: true } }),
  ]);
  const count = aggregate._count._all;
  if (!business || !businessHasFeature(business.subscriptionPlan, "REVIEWS") || count === 0) {
    return { average: null, count: 0 };
  }
  return { average: aggregate._avg.rating ?? null, count };
}

export async function listReviews(businessId: string, page = 1) {
  const skip = Math.max(page - 1, 0) * PAGE_SIZE;
  const [rows, total] = await Promise.all([
    prisma.review.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
      select: {
        id: true,
        rating: true,
        comment: true,
        isHidden: true,
        createdAt: true,
        booking: { select: { customer: { select: { name: true } } } },
      },
    }),
    prisma.review.count({ where: { businessId } }),
  ]);
  return {
    reviews: rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      isHidden: row.isHidden,
      createdAt: row.createdAt,
      customerName: row.booking.customer.name,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
  };
}

export async function setReviewHidden(businessId: string, reviewId: string, isHidden: boolean) {
  const result = await prisma.review.updateMany({ where: { id: reviewId, businessId }, data: { isHidden } });
  if (result.count !== 1) throw new ReviewError("NOT_FOUND");
  return { reviewId, isHidden };
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error
      && typeof error === "object"
      && "code" in error
      && (error as { code?: string }).code === "P2002",
  );
}
