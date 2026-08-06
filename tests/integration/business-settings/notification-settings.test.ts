import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getNotificationSettings, updateNotificationSettings } from "@/core/business-settings/notification-settings-service";
import { scheduleBusinessNotification } from "@/core/notifications/business-notification-service";
import { SettingsError } from "@/core/business-settings/settings-error";
import { prisma } from "@/core/database/prisma";
import { registerBusiness } from "@/core/onboarding/register-business";

describe("business notification settings", () => {
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
      businessName: "Салон уведомлений",
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

  it("defaults all notification toggles to enabled", async () => {
    const settings = await getNotificationSettings(businessId);
    expect(settings).toEqual({
      notifyOnNewBooking: true,
      notifyOnPaymentNeedsReview: true,
      notifyOnCancellation: true,
      smsNotificationsEnabled: false,
      subscriptionPlan: "START",
      smsFeatureAvailable: false,
    });
  });

  it("saves toggle states", async () => {
    const updated = await updateNotificationSettings({
      businessId,
      actorUserId,
      notifyOnNewBooking: false,
      notifyOnPaymentNeedsReview: true,
      notifyOnCancellation: false,
    });

    expect(updated).toEqual({
      notifyOnNewBooking: false,
      notifyOnPaymentNeedsReview: true,
      notifyOnCancellation: false,
      smsNotificationsEnabled: false,
    });

    const settings = await getNotificationSettings(businessId);
    expect(settings).toEqual({ ...updated, subscriptionPlan: "START", smsFeatureAvailable: false });
  });

  it("rejects turning on SMS notifications when the business plan does not include the SMS feature", async () => {
    await expect(updateNotificationSettings({
      businessId,
      actorUserId,
      notifyOnNewBooking: true,
      notifyOnPaymentNeedsReview: true,
      notifyOnCancellation: true,
      smsNotificationsEnabled: true,
    })).rejects.toMatchObject({ code: "PLAN_REQUIRED" } satisfies Partial<SettingsError>);
  });

  it("allows turning on SMS notifications once the business plan includes the SMS feature", async () => {
    await prisma.business.update({ where: { id: businessId }, data: { subscriptionPlan: "STANDARD" } });

    const updated = await updateNotificationSettings({
      businessId,
      actorUserId,
      notifyOnNewBooking: true,
      notifyOnPaymentNeedsReview: true,
      notifyOnCancellation: true,
      smsNotificationsEnabled: true,
    });

    expect(updated.smsNotificationsEnabled).toBe(true);
  });

  it("keeps staff from updating notification settings", async () => {
    const suffix = randomUUID();
    const staffUser = await prisma.user.create({ data: { email: `staff-${suffix}@example.test`, displayName: "Сотрудник" } });
    userIds.push(staffUser.id);
    await prisma.membership.create({ data: { businessId, userId: staffUser.id, role: "STAFF" } });

    await expect(updateNotificationSettings({
      businessId,
      actorUserId: staffUser.id,
      notifyOnNewBooking: false,
      notifyOnPaymentNeedsReview: false,
      notifyOnCancellation: false,
    })).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<SettingsError>);
  });

  it("skips scheduling a gated business notification when the toggle is disabled", async () => {
    await updateNotificationSettings({
      businessId,
      actorUserId,
      notifyOnNewBooking: false,
      notifyOnPaymentNeedsReview: true,
      notifyOnCancellation: true,
    });

    const result = await scheduleBusinessNotification({
      businessId,
      kind: "BOOKING_CONFIRMED",
      deduplicationKey: `test:${randomUUID()}`,
      scheduledAt: new Date(),
    });

    expect(result).toBeNull();
    const stored = await prisma.businessNotification.findMany({ where: { businessId, kind: "BOOKING_CONFIRMED" } });
    expect(stored).toHaveLength(0);
  });

  it("still schedules an ungated business notification kind regardless of toggles", async () => {
    await updateNotificationSettings({
      businessId,
      actorUserId,
      notifyOnNewBooking: false,
      notifyOnPaymentNeedsReview: false,
      notifyOnCancellation: false,
    });

    const result = await scheduleBusinessNotification({
      businessId,
      kind: "PAYMENT_APPROVED",
      deduplicationKey: `test:${randomUUID()}`,
      scheduledAt: new Date(),
    });

    expect(result).not.toBeNull();
  });
});
