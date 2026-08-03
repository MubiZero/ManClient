import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { PromoCodeInvalidError } from "@/core/bookings/booking-allocation";
import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import { createPromoCode, deactivatePromoCode, listPromoCodes, validatePromoCode } from "@/core/promotions/promo-code-service";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

async function createPromoFixture(plan: "START" | "STANDARD" | "PREMIUM" = "STANDARD") {
  const fixture = await createBookingFixture();
  await prisma.business.update({ where: { id: fixture.business.id }, data: { subscriptionPlan: plan } });
  const owner = await prisma.user.create({ data: { email: `owner-promo-${randomUUID()}@test.local`, displayName: "Owner" } });
  await prisma.membership.create({ data: { businessId: fixture.business.id, userId: owner.id, role: "OWNER" } });
  return { ...fixture, ownerId: owner.id };
}

type Fixture = Awaited<ReturnType<typeof createPromoFixture>>;

function seedPromoCode(fixture: Fixture, data: Partial<{ code: string; discountType: "PERCENT" | "FIXED"; discountValue: number; maxRedemptions: number | null; redemptionCount: number; expiresAt: Date | null; isActive: boolean }> = {}) {
  return prisma.promoCode.create({
    data: {
      businessId: fixture.business.id,
      code: data.code ?? "LETO2026",
      discountType: data.discountType ?? "PERCENT",
      discountValue: data.discountValue ?? 20,
      maxRedemptions: data.maxRedemptions ?? null,
      redemptionCount: data.redemptionCount ?? 0,
      expiresAt: data.expiresAt ?? null,
      isActive: data.isActive ?? true,
    },
  });
}

describe("createPromoCode", () => {
  it("stores the code upper-cased and writes an audit event", async () => {
    const fixture = await createPromoFixture();

    const created = await createPromoCode({
      businessId: fixture.business.id,
      actorUserId: fixture.ownerId,
      code: " leto2026 ",
      discountType: "PERCENT",
      discountValue: 20,
      maxRedemptions: 10,
      expiresAt: new Date("2026-09-01T00:00:00.000Z"),
    });

    expect(created).toMatchObject({ code: "LETO2026", discountType: "PERCENT", discountValue: 20, maxRedemptions: 10, redemptionCount: 0, isActive: true });
    await expect(prisma.auditEvent.findFirst({ where: { businessId: fixture.business.id, type: "promo_code.created" } })).resolves.toMatchObject({
      metadata: { promoCodeId: created.id, code: "LETO2026" },
    });
    await expect(listPromoCodes(fixture.business.id)).resolves.toHaveLength(1);
  });

  it("rejects when the business plan does not include promo codes", async () => {
    const fixture = await createPromoFixture("START");

    await expect(
      createPromoCode({ businessId: fixture.business.id, actorUserId: fixture.ownerId, code: "LETO2026", discountType: "PERCENT", discountValue: 20 }),
    ).rejects.toMatchObject({ code: "PLAN_REQUIRED" });
    expect(await prisma.promoCode.count({ where: { businessId: fixture.business.id } })).toBe(0);
  });

  it("rejects a duplicate code regardless of case", async () => {
    const fixture = await createPromoFixture();
    await createPromoCode({ businessId: fixture.business.id, actorUserId: fixture.ownerId, code: "LETO2026", discountType: "PERCENT", discountValue: 20 });

    await expect(
      createPromoCode({ businessId: fixture.business.id, actorUserId: fixture.ownerId, code: "leto2026", discountType: "FIXED", discountValue: 500 }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT", details: { reason: "DUPLICATE_CODE" } });
    expect(await prisma.promoCode.count({ where: { businessId: fixture.business.id } })).toBe(1);
  });

  it("rejects a percent discount above 100, a malformed code and a non-positive value", async () => {
    const fixture = await createPromoFixture();
    const base = { businessId: fixture.business.id, actorUserId: fixture.ownerId, discountType: "PERCENT" as const, discountValue: 20 };

    await expect(createPromoCode({ ...base, code: "LETO2026", discountValue: 101 })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(createPromoCode({ ...base, code: "ЛЕТО" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(createPromoCode({ ...base, code: "AB" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(createPromoCode({ ...base, code: "LETO2026", discountValue: 0 })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(await prisma.promoCode.count({ where: { businessId: fixture.business.id } })).toBe(0);
  });

  it("refuses a staff member without settings access", async () => {
    const fixture = await createPromoFixture();
    const staffMembership = await prisma.membership.findFirstOrThrow({ where: { businessId: fixture.business.id, role: "STAFF" } });

    await expect(
      createPromoCode({ businessId: fixture.business.id, actorUserId: staffMembership.userId, code: "LETO2026", discountType: "PERCENT", discountValue: 20 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("validatePromoCode", () => {
  it("computes a percent discount and matches the code case-insensitively", async () => {
    const fixture = await createPromoFixture();
    await seedPromoCode(fixture, { discountType: "PERCENT", discountValue: 20 });

    await expect(validatePromoCode({ businessId: fixture.business.id, code: " leto2026 ", serviceAmountDiram: 5_000 })).resolves.toMatchObject({
      valid: true,
      discountDiram: 1_000,
      finalAmountDiram: 4_000,
    });
  });

  it("caps a fixed discount at the service price", async () => {
    const fixture = await createPromoFixture();
    await seedPromoCode(fixture, { discountType: "FIXED", discountValue: 8_000 });

    await expect(validatePromoCode({ businessId: fixture.business.id, code: "LETO2026", serviceAmountDiram: 5_000 })).resolves.toMatchObject({
      valid: true,
      discountDiram: 5_000,
      finalAmountDiram: 0,
    });
  });

  it("reports why a code cannot be used", async () => {
    const fixture = await createPromoFixture();
    await seedPromoCode(fixture, { code: "INACTIVE1", isActive: false });
    await seedPromoCode(fixture, { code: "EXPIRED1", expiresAt: new Date("2020-01-01T00:00:00.000Z") });
    await seedPromoCode(fixture, { code: "USEDUP1", maxRedemptions: 2, redemptionCount: 2 });

    const check = (code: string) => validatePromoCode({ businessId: fixture.business.id, code, serviceAmountDiram: 5_000 });
    await expect(check("NOSUCHCODE")).resolves.toEqual({ valid: false, reason: "NOT_FOUND" });
    await expect(check("INACTIVE1")).resolves.toEqual({ valid: false, reason: "INACTIVE" });
    await expect(check("EXPIRED1")).resolves.toEqual({ valid: false, reason: "EXPIRED" });
    await expect(check("USEDUP1")).resolves.toEqual({ valid: false, reason: "LIMIT_REACHED" });
  });

  it("does not match a code belonging to another business", async () => {
    const fixture = await createPromoFixture();
    const other = await createPromoFixture();
    await seedPromoCode(other, { code: "OTHERBIZ" });

    await expect(validatePromoCode({ businessId: fixture.business.id, code: "OTHERBIZ", serviceAmountDiram: 5_000 })).resolves.toEqual({
      valid: false,
      reason: "NOT_FOUND",
    });
  });
});

describe("promo code redemption during booking", () => {
  const bookingInput = (fixture: Fixture, promoCode?: string) => ({
    businessSlug: fixture.business.slug,
    branchId: fixture.branch.id,
    serviceId: fixture.service.id,
    staffId: fixture.staff.id,
    resourceIds: [],
    startsAt: new Date("2026-08-02T05:00:00.000Z"),
    customer: { name: "Мухаммад", phone: "+992900001122" },
    ...(promoCode ? { promoCode } : {}),
  });

  it("discounts the payment, records the redemption and increments the counter", async () => {
    const fixture = await createPromoFixture();
    const promoCode = await seedPromoCode(fixture, { discountType: "PERCENT", discountValue: 20, maxRedemptions: 5 });

    const pending = await createPendingBooking(bookingInput(fixture, "leto2026"), new Date("2026-08-01T04:00:00.000Z"));

    await expect(prisma.payment.findFirstOrThrow({ where: { bookingId: pending.bookingId } })).resolves.toMatchObject({ amountDiram: 4_000 });
    await expect(prisma.promoCodeRedemption.findUniqueOrThrow({ where: { bookingId: pending.bookingId } })).resolves.toMatchObject({
      promoCodeId: promoCode.id,
      discountAppliedDiram: 1_000,
    });
    await expect(prisma.promoCode.findUniqueOrThrow({ where: { id: promoCode.id } })).resolves.toMatchObject({ redemptionCount: 1 });
  });

  it("charges the full price when no promo code is supplied", async () => {
    const fixture = await createPromoFixture();

    const pending = await createPendingBooking(bookingInput(fixture), new Date("2026-08-01T04:00:00.000Z"));

    await expect(prisma.payment.findFirstOrThrow({ where: { bookingId: pending.bookingId } })).resolves.toMatchObject({ amountDiram: 5_000 });
    expect(await prisma.promoCodeRedemption.count({ where: { bookingId: pending.bookingId } })).toBe(0);
  });

  it("rejects the booking outright when the promo code is not usable", async () => {
    const fixture = await createPromoFixture();
    await seedPromoCode(fixture, { code: "USEDUP1", maxRedemptions: 1, redemptionCount: 1 });

    await expect(createPendingBooking(bookingInput(fixture, "USEDUP1"), new Date("2026-08-01T04:00:00.000Z"))).rejects.toBeInstanceOf(PromoCodeInvalidError);
    await expect(createPendingBooking(bookingInput(fixture, "NOSUCHCODE"), new Date("2026-08-01T04:00:00.000Z"))).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(await prisma.booking.count({ where: { businessId: fixture.business.id } })).toBe(0);
  });

  it("stops accepting the code once its redemption limit is reached", async () => {
    const fixture = await createPromoFixture();
    await seedPromoCode(fixture, { discountType: "FIXED", discountValue: 1_000, maxRedemptions: 1 });

    await createPendingBooking(bookingInput(fixture, "LETO2026"), new Date("2026-08-01T04:00:00.000Z"));
    await expect(
      createPendingBooking({ ...bookingInput(fixture, "LETO2026"), startsAt: new Date("2026-08-02T07:00:00.000Z") }, new Date("2026-08-01T04:00:00.000Z")),
    ).rejects.toMatchObject({ code: "LIMIT_REACHED" });
  });
});

describe("deactivatePromoCode", () => {
  it("deactivates the code, audits it and stops further redemptions", async () => {
    const fixture = await createPromoFixture();
    const promoCode = await seedPromoCode(fixture);

    await expect(deactivatePromoCode(fixture.business.id, promoCode.id, fixture.ownerId)).resolves.toMatchObject({ isActive: false });
    await expect(prisma.auditEvent.findFirst({ where: { businessId: fixture.business.id, type: "promo_code.deactivated" } })).resolves.toMatchObject({
      metadata: { promoCodeId: promoCode.id },
    });
    await expect(validatePromoCode({ businessId: fixture.business.id, code: "LETO2026", serviceAmountDiram: 5_000 })).resolves.toEqual({
      valid: false,
      reason: "INACTIVE",
    });
  });

  it("refuses an unknown code and a code from another business", async () => {
    const fixture = await createPromoFixture();
    const other = await createPromoFixture();
    const promoCode = await seedPromoCode(other, { code: "OTHERBIZ" });

    await expect(deactivatePromoCode(fixture.business.id, "missing-promo", fixture.ownerId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deactivatePromoCode(fixture.business.id, promoCode.id, fixture.ownerId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
