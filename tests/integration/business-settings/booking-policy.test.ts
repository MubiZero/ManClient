import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getBookingPolicySettings, updateBookingPolicySettings } from "@/core/business-settings/booking-policy-service";
import { SettingsError } from "@/core/business-settings/settings-error";
import { prisma } from "@/core/database/prisma";
import { registerBusiness } from "@/core/onboarding/register-business";

/**
 * These four numbers decide which bookings a business can still receive, so the settings layer has to be
 * strict about them: an empty field must mean "no rule" rather than zero, and a typo in the wrong unit
 * must be refused instead of quietly emptying the public calendar.
 */
describe("booking policy settings", () => {
  const businessIds: string[] = [];
  const userIds: string[] = [];
  let businessId: string;
  let actorUserId: string;

  beforeEach(async () => {
    const suffix = randomUUID().replace(/\D/g, "").padEnd(8, "8").slice(0, 8);
    const registered = await registerBusiness({
      ownerName: "Владелец",
      phone: `+9929${suffix}`,
      password: "safe-password",
      businessName: "Салон правил",
    });
    businessId = registered.businessId;
    actorUserId = registered.userId;
    businessIds.push(businessId);
    userIds.push(actorUserId);
  });

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  });

  it("starts a new business with no restrictions", async () => {
    await expect(getBookingPolicySettings(businessId)).resolves.toEqual({
      minLeadTimeMinutes: 0,
      maxAdvanceDays: null,
      freeCancellationHours: 0,
      maxCustomerReschedules: null,
      cancellationPolicy: null,
      prepaymentMode: "FULL",
      depositPercent: null,
      depositAmountDiram: null,
    });
  });

  it("saves every rule and the text that explains them", async () => {
    const updated = await updateBookingPolicySettings({
      businessId,
      actorUserId,
      minLeadTimeMinutes: 120,
      maxAdvanceDays: 60,
      freeCancellationHours: 24,
      maxCustomerReschedules: 2,
      cancellationPolicy: "При опоздании больше чем на 15 минут визит переносится.",
      prepaymentMode: "DEPOSIT",
      depositPercent: 30,
    });

    expect(updated).toEqual({
      minLeadTimeMinutes: 120,
      maxAdvanceDays: 60,
      freeCancellationHours: 24,
      maxCustomerReschedules: 2,
      cancellationPolicy: "При опоздании больше чем на 15 минут визит переносится.",
      prepaymentMode: "DEPOSIT",
      depositPercent: 30,
      depositAmountDiram: null,
    });
    await expect(getBookingPolicySettings(businessId)).resolves.toEqual(updated);
  });

  it("accepts strings from the form and treats a blank field as no rule", async () => {
    await updateBookingPolicySettings({ businessId, actorUserId, minLeadTimeMinutes: 60, maxAdvanceDays: 30, freeCancellationHours: 4, maxCustomerReschedules: 1 });

    const cleared = await updateBookingPolicySettings({
      businessId,
      actorUserId,
      minLeadTimeMinutes: "0",
      maxAdvanceDays: "",
      freeCancellationHours: "0",
      maxCustomerReschedules: "",
      cancellationPolicy: "",
    });

    expect(cleared).toEqual({
      minLeadTimeMinutes: 0,
      maxAdvanceDays: null,
      freeCancellationHours: 0,
      maxCustomerReschedules: null,
      cancellationPolicy: null,
      prepaymentMode: "FULL",
      depositPercent: null,
      depositAmountDiram: null,
    });
  });

  it("keeps a deposit amount only while the deposit mode is set", async () => {
    await updateBookingPolicySettings({ businessId, actorUserId, minLeadTimeMinutes: 0, freeCancellationHours: 0, prepaymentMode: "DEPOSIT", depositSomoni: "50,00" });
    await expect(getBookingPolicySettings(businessId)).resolves.toMatchObject({ prepaymentMode: "DEPOSIT", depositAmountDiram: 5_000, depositPercent: null });

    // Switching away must not leave the amount behind: it would spring back to life the next time
    // somebody chose "deposit" again, with a number nobody had looked at.
    const cleared = await updateBookingPolicySettings({ businessId, actorUserId, minLeadTimeMinutes: 0, freeCancellationHours: 0, prepaymentMode: "NONE", depositSomoni: "50,00" });
    expect(cleared).toMatchObject({ prepaymentMode: "NONE", depositAmountDiram: null, depositPercent: null });
  });

  it("refuses a deposit with no amount to charge", async () => {
    await expect(
      updateBookingPolicySettings({ businessId, actorUserId, minLeadTimeMinutes: 0, freeCancellationHours: 0, prepaymentMode: "DEPOSIT" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" } satisfies Partial<SettingsError>);
  });

  it("refuses values that would empty the calendar or are obviously the wrong unit", async () => {
    const base = { businessId, actorUserId, freeCancellationHours: 0, minLeadTimeMinutes: 0 };

    // A week is the ceiling for notice; a year for the horizon.
    await expect(updateBookingPolicySettings({ ...base, minLeadTimeMinutes: 20_000 })).rejects.toMatchObject({ code: "INVALID_INPUT" } satisfies Partial<SettingsError>);
    await expect(updateBookingPolicySettings({ ...base, maxAdvanceDays: 0 })).rejects.toMatchObject({ code: "INVALID_INPUT" } satisfies Partial<SettingsError>);
    await expect(updateBookingPolicySettings({ ...base, maxAdvanceDays: 400 })).rejects.toMatchObject({ code: "INVALID_INPUT" } satisfies Partial<SettingsError>);
    await expect(updateBookingPolicySettings({ ...base, freeCancellationHours: 400 })).rejects.toMatchObject({ code: "INVALID_INPUT" } satisfies Partial<SettingsError>);
    await expect(updateBookingPolicySettings({ ...base, minLeadTimeMinutes: 30.5 })).rejects.toMatchObject({ code: "INVALID_INPUT" } satisfies Partial<SettingsError>);
    await expect(updateBookingPolicySettings({ ...base, cancellationPolicy: "a".repeat(501) })).rejects.toMatchObject({ code: "INVALID_INPUT" } satisfies Partial<SettingsError>);
  });

  it("records the change in the audit log", async () => {
    await updateBookingPolicySettings({ businessId, actorUserId, minLeadTimeMinutes: 60, freeCancellationHours: 12 });

    const events = await prisma.auditEvent.findMany({ where: { businessId, type: "booking_policy.updated" } });
    expect(events).toHaveLength(1);
    expect(events[0]?.metadata).toMatchObject({ minLeadTimeMinutes: 60, freeCancellationHours: 12 });
  });

  it("keeps staff from changing the rules", async () => {
    const suffix = randomUUID();
    const staffUser = await prisma.user.create({ data: { email: `staff-${suffix}@example.test`, displayName: "Сотрудник" } });
    userIds.push(staffUser.id);
    await prisma.membership.create({ data: { businessId, userId: staffUser.id, role: "STAFF" } });

    await expect(
      updateBookingPolicySettings({ businessId, actorUserId: staffUser.id, minLeadTimeMinutes: 0, freeCancellationHours: 48 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<SettingsError>);
  });
});
