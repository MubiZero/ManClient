import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { collectBusinessMetrics } from "@/core/observability/business-metrics";
import { renderPrometheus } from "@/core/observability/queue-metrics";
import { prisma } from "@/core/database/prisma";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

/**
 * The five numbers the pilot decides by. Each case pins the one thing that would make its metric lie:
 * a window that counts the wrong month, a customer counted on both sides of a split, an average taken
 * over receipts nobody has reviewed yet.
 */
describe("business metrics", () => {
  const businessIds: string[] = [];
  const now = new Date("2026-08-14T12:00:00.000Z");

  // Charges outlive the business they were spent on, by design — so the platform bucket accumulates
  // whatever earlier files sent. It is cleared before each case rather than after, since a leftover from
  // a file that ran first would otherwise be counted here.
  beforeEach(async () => {
    await prisma.smsCharge.deleteMany({ where: { businessId: null } });
  });

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.smsCharge.deleteMany({ where: { businessId: null } });
  });

  function sampleFor(metrics: Awaited<ReturnType<typeof collectBusinessMetrics>>, name: string, labels: Record<string, string>) {
    return metrics
      .find(metric => metric.name === name)
      ?.samples.find(sample => Object.entries(labels).every(([key, value]) => sample.labels?.[key] === value))
      ?.value;
  }

  it("counts the SMS of the last thirty days and prices them", async () => {
    const business = await createBusiness();
    await prisma.smsCharge.createMany({
      data: [
        { businessId: business.id, purpose: "NOTIFICATION", sentAt: new Date("2026-08-13T12:00:00.000Z") },
        { businessId: business.id, purpose: "NOTIFICATION", sentAt: new Date("2026-07-20T12:00:00.000Z") },
        { businessId: business.id, purpose: "VERIFICATION", sentAt: new Date("2026-08-01T12:00:00.000Z") },
        // Older than the window: a month's cost must not include the month before it.
        { businessId: business.id, purpose: "NOTIFICATION", sentAt: new Date("2026-06-01T12:00:00.000Z") },
      ],
    });

    const metrics = await collectBusinessMetrics(now);

    expect(sampleFor(metrics, "manclient_sms_sent_30d", { businessId: business.id, purpose: "NOTIFICATION" })).toBe(2);
    expect(sampleFor(metrics, "manclient_sms_sent_30d", { businessId: business.id, purpose: "VERIFICATION" })).toBe(1);
    // Three messages at 4,5 дирама — 13,5 дирама, the whole point of the metric.
    expect(sampleFor(metrics, "manclient_sms_cost_diram_30d", { businessId: business.id })).toBe(13.5);
  });

  it("books a code with no salon against the platform rather than dropping it", async () => {
    await prisma.smsCharge.create({ data: { businessId: null, purpose: "VERIFICATION", sentAt: new Date("2026-08-10T12:00:00.000Z") } });

    const metrics = await collectBusinessMetrics(now);

    expect(sampleFor(metrics, "manclient_sms_sent_30d", { businessId: "platform", purpose: "VERIFICATION" })).toBe(1);
  });

  it("splits customers by whether the free channel reaches them, without counting anyone twice", async () => {
    const business = await createBusiness();
    await prisma.customer.createMany({
      data: [
        { businessId: business.id, phone: "+992900010001", name: "С Telegram", telegramChatId: `chat-${randomUUID()}` },
        { businessId: business.id, phone: "+992900010002", name: "Без Telegram" },
        { businessId: business.id, phone: "+992900010003", name: "Тоже без" },
      ],
    });

    const metrics = await collectBusinessMetrics(now);

    expect(sampleFor(metrics, "manclient_customers", { businessId: business.id, telegram: "yes" })).toBe(1);
    expect(sampleFor(metrics, "manclient_customers", { businessId: business.id, telegram: "no" })).toBe(2);
  });

  it("separates receipts settled automatically from the ones a human had to open", async () => {
    const business = await createBusiness();
    const invoice = await prisma.subscriptionInvoice.create({
      data: { businessId: business.id, plan: "START", period: "MONTHLY", amountDiram: 9_900, reference: `INV-${randomUUID().slice(0, 8)}`, createdAt: new Date("2026-08-01T09:00:00.000Z") },
    });
    await prisma.subscriptionReceipt.createMany({
      data: [
        { invoiceId: invoice.id, businessId: business.id, storageKey: `a-${randomUUID()}`, contentType: "image/jpeg", sizeBytes: 100, status: "ACCEPTED", createdAt: new Date("2026-08-01T10:00:00.000Z") },
        { invoiceId: invoice.id, businessId: business.id, storageKey: `b-${randomUUID()}`, contentType: "image/jpeg", sizeBytes: 100, status: "NEEDS_REVIEW", attentionReason: "AMOUNT_MISMATCH", createdAt: new Date("2026-08-02T10:00:00.000Z"), reviewedAt: new Date("2026-08-02T10:30:00.000Z") },
        { invoiceId: invoice.id, businessId: business.id, storageKey: `c-${randomUUID()}`, contentType: "image/jpeg", sizeBytes: 100, status: "NEEDS_REVIEW", attentionReason: "OCR_UNRELIABLE", createdAt: new Date("2026-08-03T10:00:00.000Z"), reviewedAt: new Date("2026-08-03T11:30:00.000Z") },
        // Still waiting: an unreviewed receipt has no duration and must not be averaged as a fast one.
        { invoiceId: invoice.id, businessId: business.id, storageKey: `d-${randomUUID()}`, contentType: "image/jpeg", sizeBytes: 100, status: "NEEDS_REVIEW", attentionReason: "OCR_UNRELIABLE", createdAt: new Date("2026-08-04T10:00:00.000Z") },
      ],
    });

    const metrics = await collectBusinessMetrics(now);

    expect(sampleFor(metrics, "manclient_subscription_receipts_30d", { status: "ACCEPTED" })).toBe(1);
    expect(sampleFor(metrics, "manclient_subscription_receipts_30d", { status: "NEEDS_REVIEW" })).toBe(3);
    // Thirty minutes and ninety, averaged over the two that were actually decided.
    expect(metrics.find(metric => metric.name === "manclient_subscription_review_minutes")?.samples[0]?.value).toBe(60);
  });

  it("counts a salon as alive on a booking this week, and a customer as returning on a second visit", async () => {
    const fixture = await createBookingFixture();
    businessIds.push(fixture.business.id);
    const customer = await prisma.customer.create({ data: { businessId: fixture.business.id, phone: "+992900020001", name: "Вернулся" } });
    const once = await prisma.customer.create({ data: { businessId: fixture.business.id, phone: "+992900020002", name: "Один раз" } });
    await prisma.booking.createMany({
      data: [
        booking(fixture, customer.id, new Date("2026-08-10T09:00:00.000Z")),
        booking(fixture, customer.id, new Date("2026-08-12T09:00:00.000Z")),
        booking(fixture, once.id, new Date("2026-08-11T09:00:00.000Z")),
      ],
    });

    const metrics = await collectBusinessMetrics(now);

    expect(metrics.find(metric => metric.name === "manclient_active_businesses_7d")?.samples[0]?.value).toBeGreaterThanOrEqual(1);
    expect(sampleFor(metrics, "manclient_customers_90d", { kind: "booked" })).toBeGreaterThanOrEqual(2);
    expect(sampleFor(metrics, "manclient_customers_90d", { kind: "returned" })).toBeGreaterThanOrEqual(1);
  });

  it("renders every metric in a form a scraper can read", async () => {
    const text = renderPrometheus(await collectBusinessMetrics(now));

    for (const name of [
      "manclient_sms_sent_30d",
      "manclient_sms_cost_diram_30d",
      "manclient_customers",
      "manclient_subscription_receipts_30d",
      "manclient_subscription_review_minutes",
      "manclient_active_businesses_7d",
      "manclient_businesses",
      "manclient_customers_90d",
    ]) {
      expect(text).toContain(`# TYPE ${name} gauge`);
    }
  });

  async function createBusiness() {
    const business = await prisma.business.create({ data: { name: "Салон метрик", slug: `metrics-${randomUUID()}` } });
    businessIds.push(business.id);
    return business;
  }

  function booking(fixture: Awaited<ReturnType<typeof createBookingFixture>>, customerId: string, startsAt: Date) {
    return {
      businessId: fixture.business.id,
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      customerId,
      status: "CONFIRMED" as const,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 45 * 60_000),
      createdAt: startsAt,
    };
  }
});
