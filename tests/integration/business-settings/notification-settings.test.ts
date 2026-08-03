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

  it("defaults all notification toggles to enabled with no cancellation policy", async () => {
    const settings = await getNotificationSettings(businessId);
    expect(settings).toEqual({
      notifyOnNewBooking: true,
      notifyOnPaymentNeedsReview: true,
      notifyOnCancellation: true,
      cancellationPolicy: null,
    });
  });

  it("saves toggle states and the cancellation policy", async () => {
    const updated = await updateNotificationSettings({
      businessId,
      actorUserId,
      notifyOnNewBooking: false,
      notifyOnPaymentNeedsReview: true,
      notifyOnCancellation: false,
      cancellationPolicy: "Отмена бесплатна за 24 часа.",
    });

    expect(updated).toEqual({
      notifyOnNewBooking: false,
      notifyOnPaymentNeedsReview: true,
      notifyOnCancellation: false,
      cancellationPolicy: "Отмена бесплатна за 24 часа.",
    });

    const settings = await getNotificationSettings(businessId);
    expect(settings).toEqual(updated);
  });

  it("clears the cancellation policy when left blank", async () => {
    await updateNotificationSettings({
      businessId,
      actorUserId,
      notifyOnNewBooking: true,
      notifyOnPaymentNeedsReview: true,
      notifyOnCancellation: true,
      cancellationPolicy: "Временная политика",
    });
    const cleared = await updateNotificationSettings({
      businessId,
      actorUserId,
      notifyOnNewBooking: true,
      notifyOnPaymentNeedsReview: true,
      notifyOnCancellation: true,
      cancellationPolicy: "",
    });

    expect(cleared.cancellationPolicy).toBeNull();
  });

  it("rejects a cancellation policy longer than 500 characters", async () => {
    await expect(updateNotificationSettings({
      businessId,
      actorUserId,
      notifyOnNewBooking: true,
      notifyOnPaymentNeedsReview: true,
      notifyOnCancellation: true,
      cancellationPolicy: "a".repeat(501),
    })).rejects.toMatchObject({ code: "INVALID_INPUT" } satisfies Partial<SettingsError>);
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
