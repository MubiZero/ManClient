import { describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import { scheduleReviewRequest } from "@/core/notifications/notification-service";
import { getAverageRating, listReviews, setReviewHidden, submitReview } from "@/core/reviews/review-service";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

async function createReviewFixture(plan: "START" | "STANDARD" | "PREMIUM" = "PREMIUM") {
  const fixture = await createBookingFixture();
  await prisma.business.update({ where: { id: fixture.business.id }, data: { subscriptionPlan: plan } });
  return fixture;
}

type Fixture = Awaited<ReturnType<typeof createReviewFixture>>;

let phoneCounter = 4000;
/** Each visit inside one fixture needs its own slot, otherwise the second booking hits a conflict. */
const visitsPerBusiness = new Map<string, number>();

/** Creates a confirmed past booking, the shape a review invitation is sent for. */
async function createVisit(fixture: Fixture, options: { name?: string } = {}) {
  phoneCounter += 1;
  const phone = `+99290000${phoneCounter}`;
  const visitIndex = visitsPerBusiness.get(fixture.business.id) ?? 0;
  visitsPerBusiness.set(fixture.business.id, visitIndex + 1);
  const startsAt = `2026-08-02T${String(5 + visitIndex).padStart(2, "0")}:00:00.000Z`;
  const pending = await createPendingBooking(
    {
      businessSlug: fixture.business.slug,
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      resourceIds: [],
      startsAt: new Date(startsAt),
      customer: { name: options.name ?? "Мухаммад", phone },
    },
    new Date("2026-08-01T04:00:00.000Z"),
  );
  const booking = await prisma.booking.update({
    where: { id: pending.bookingId },
    data: { status: "CONFIRMED", confirmedAt: new Date("2026-08-01T04:05:00.000Z"), expiresAt: null },
  });
  return { bookingId: booking.id, customerId: booking.customerId, endsAt: booking.endsAt, phone };
}

describe("submitReview", () => {
  it("stores the rating and the trimmed comment", async () => {
    const fixture = await createReviewFixture();
    const visit = await createVisit(fixture);

    const review = await submitReview({ bookingId: visit.bookingId, customerId: visit.customerId, rating: 5, comment: "  Отлично подстригли  " });

    expect(review).toMatchObject({ businessId: fixture.business.id, bookingId: visit.bookingId, rating: 5, comment: "Отлично подстригли", isHidden: false });
  });

  it("stores a blank comment as null", async () => {
    const fixture = await createReviewFixture();
    const visit = await createVisit(fixture);

    const review = await submitReview({ bookingId: visit.bookingId, customerId: visit.customerId, rating: 4, comment: "   " });

    expect(review.comment).toBeNull();
  });

  it("rejects a rating outside 1-5 and a non-integer rating", async () => {
    const fixture = await createReviewFixture();
    const visit = await createVisit(fixture);

    for (const rating of [0, 6, 4.5, Number.NaN]) {
      await expect(submitReview({ bookingId: visit.bookingId, customerId: visit.customerId, rating })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    expect(await prisma.review.count({ where: { bookingId: visit.bookingId } })).toBe(0);
  });

  it("rejects an unknown booking and a customer who does not own the booking", async () => {
    const fixture = await createReviewFixture();
    const visit = await createVisit(fixture);
    const stranger = await createVisit(fixture);

    await expect(submitReview({ bookingId: "missing-booking", customerId: visit.customerId, rating: 5 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(submitReview({ bookingId: visit.bookingId, customerId: stranger.customerId, rating: 5 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a submission once the business drops below the reviews plan", async () => {
    const fixture = await createReviewFixture();
    const visit = await createVisit(fixture);
    await prisma.business.update({ where: { id: fixture.business.id }, data: { subscriptionPlan: "STANDARD" } });

    await expect(submitReview({ bookingId: visit.bookingId, customerId: visit.customerId, rating: 5 })).rejects.toMatchObject({ code: "PLAN_REQUIRED" });
    expect(await prisma.review.count({ where: { bookingId: visit.bookingId } })).toBe(0);
  });

  it("rejects a second review for the same booking", async () => {
    const fixture = await createReviewFixture();
    const visit = await createVisit(fixture);
    await submitReview({ bookingId: visit.bookingId, customerId: visit.customerId, rating: 5 });

    await expect(submitReview({ bookingId: visit.bookingId, customerId: visit.customerId, rating: 1 })).rejects.toMatchObject({ code: "ALREADY_SUBMITTED" });
    expect(await prisma.review.count({ where: { bookingId: visit.bookingId } })).toBe(1);
  });
});

describe("getAverageRating", () => {
  it("averages visible reviews and ignores hidden ones", async () => {
    const fixture = await createReviewFixture();
    for (const rating of [5, 3]) {
      const visit = await createVisit(fixture);
      await submitReview({ bookingId: visit.bookingId, customerId: visit.customerId, rating });
    }

    await expect(getAverageRating(fixture.business.id)).resolves.toEqual({ average: 4, count: 2 });

    const hidden = await createVisit(fixture);
    const hiddenReview = await submitReview({ bookingId: hidden.bookingId, customerId: hidden.customerId, rating: 1 });
    await setReviewHidden(fixture.business.id, hiddenReview.id, true);

    await expect(getAverageRating(fixture.business.id)).resolves.toEqual({ average: 4, count: 2 });
  });

  it("returns no rating for a business without any reviews", async () => {
    const fixture = await createReviewFixture();

    await expect(getAverageRating(fixture.business.id)).resolves.toEqual({ average: null, count: 0 });
  });

  it("hides the rating when the plan does not include reviews", async () => {
    const fixture = await createReviewFixture("PREMIUM");
    const visit = await createVisit(fixture);
    await submitReview({ bookingId: visit.bookingId, customerId: visit.customerId, rating: 5 });

    await prisma.business.update({ where: { id: fixture.business.id }, data: { subscriptionPlan: "STANDARD" } });

    await expect(getAverageRating(fixture.business.id)).resolves.toEqual({ average: null, count: 0 });
  });
});

describe("listReviews and setReviewHidden", () => {
  it("lists reviews newest first with the customer name attached", async () => {
    const fixture = await createReviewFixture();
    const first = await createVisit(fixture, { name: "Первый" });
    await submitReview({ bookingId: first.bookingId, customerId: first.customerId, rating: 4, comment: "Хорошо" });
    const second = await createVisit(fixture, { name: "Второй" });
    await submitReview({ bookingId: second.bookingId, customerId: second.customerId, rating: 2 });

    const result = await listReviews(fixture.business.id);

    expect(result).toMatchObject({ total: 2, page: 1, pageSize: 20 });
    expect(result.reviews.map((review) => review.customerName)).toEqual(["Второй", "Первый"]);
    expect(result.reviews[1]).toMatchObject({ rating: 4, comment: "Хорошо", isHidden: false });
  });

  it("returns an empty page past the end of the list", async () => {
    const fixture = await createReviewFixture();
    const visit = await createVisit(fixture);
    await submitReview({ bookingId: visit.bookingId, customerId: visit.customerId, rating: 5 });

    await expect(listReviews(fixture.business.id, 2)).resolves.toMatchObject({ reviews: [], total: 1, page: 2 });
  });

  it("hides and unhides a review, and refuses a review from another business", async () => {
    const fixture = await createReviewFixture();
    const other = await createReviewFixture();
    const visit = await createVisit(fixture);
    const review = await submitReview({ bookingId: visit.bookingId, customerId: visit.customerId, rating: 1 });

    await expect(setReviewHidden(fixture.business.id, review.id, true)).resolves.toEqual({ reviewId: review.id, isHidden: true });
    await expect(prisma.review.findUniqueOrThrow({ where: { id: review.id } })).resolves.toMatchObject({ isHidden: true });

    await setReviewHidden(fixture.business.id, review.id, false);
    await expect(prisma.review.findUniqueOrThrow({ where: { id: review.id } })).resolves.toMatchObject({ isHidden: false });

    await expect(setReviewHidden(other.business.id, review.id, true)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setReviewHidden(fixture.business.id, "missing-review", true)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("scheduleReviewRequest", () => {
  it("queues a Telegram review invitation two hours after the visit ends", async () => {
    const fixture = await createReviewFixture();
    const visit = await createVisit(fixture);
    await prisma.customer.update({ where: { id: visit.customerId }, data: { telegramChatId: "555000111" } });

    const message = await scheduleReviewRequest(visit.bookingId);

    expect(message).toMatchObject({ channel: "TELEGRAM", kind: "REVIEW_REQUEST", status: "SCHEDULED" });
    expect(message?.scheduledAt.toISOString()).toBe(new Date(visit.endsAt.getTime() + 2 * 60 * 60_000).toISOString());
  });

  it("skips a customer without Telegram, a plan without reviews and a non-confirmed booking", async () => {
    const withoutTelegram = await createReviewFixture();
    const noChat = await createVisit(withoutTelegram);
    await expect(scheduleReviewRequest(noChat.bookingId)).resolves.toBeNull();

    const lowPlan = await createReviewFixture("STANDARD");
    const lowPlanVisit = await createVisit(lowPlan);
    await prisma.customer.update({ where: { id: lowPlanVisit.customerId }, data: { telegramChatId: "555000222" } });
    await expect(scheduleReviewRequest(lowPlanVisit.bookingId)).resolves.toBeNull();

    const cancelled = await createReviewFixture();
    const cancelledVisit = await createVisit(cancelled);
    await prisma.customer.update({ where: { id: cancelledVisit.customerId }, data: { telegramChatId: "555000333" } });
    await prisma.booking.update({ where: { id: cancelledVisit.bookingId }, data: { status: "CANCELLED" } });
    await expect(scheduleReviewRequest(cancelledVisit.bookingId)).resolves.toBeNull();

    expect(await prisma.message.count({ where: { kind: "REVIEW_REQUEST", bookingId: { in: [noChat.bookingId, lowPlanVisit.bookingId, cancelledVisit.bookingId] } } })).toBe(0);
  });
});
