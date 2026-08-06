import { requireSettingsAccess } from "@/core/business-settings/authorize-settings";
import { notificationSettingsSchema } from "@/core/business-settings/setting-schemas";
import { SettingsError } from "@/core/business-settings/settings-error";
import { businessHasFeature, requirePlanFeature } from "@/core/platform/subscription-plans";
import { writeAuditEvent } from "@/core/audit/audit-service";
import { prisma } from "@/core/database/prisma";

export async function getNotificationSettings(businessId: string) {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: {
      notifyOnNewBooking: true,
      notifyOnPaymentNeedsReview: true,
      notifyOnCancellation: true,
      smsNotificationsEnabled: true,
      subscriptionPlan: true,
    },
  });
  return { ...business, smsFeatureAvailable: businessHasFeature(business.subscriptionPlan, "SMS") };
}

export async function updateNotificationSettings(input: {
  businessId: string;
  actorUserId: string;
  notifyOnNewBooking: boolean;
  notifyOnPaymentNeedsReview: boolean;
  notifyOnCancellation: boolean;
  smsNotificationsEnabled?: boolean;
}) {
  const parsed = notificationSettingsSchema.safeParse({
    notifyOnNewBooking: input.notifyOnNewBooking,
    notifyOnPaymentNeedsReview: input.notifyOnPaymentNeedsReview,
    notifyOnCancellation: input.notifyOnCancellation,
    smsNotificationsEnabled: input.smsNotificationsEnabled ?? false,
  });
  if (!parsed.success) throw new SettingsError("INVALID_INPUT");

  return prisma.$transaction(async (transaction) => {
    await requireSettingsAccess(transaction, input);
    if (parsed.data.smsNotificationsEnabled) {
      const business = await transaction.business.findUniqueOrThrow({ where: { id: input.businessId }, select: { subscriptionPlan: true } });
      requirePlanFeature(business.subscriptionPlan, "SMS");
    }
    const updated = await transaction.business.update({
      where: { id: input.businessId },
      data: {
        notifyOnNewBooking: parsed.data.notifyOnNewBooking,
        notifyOnPaymentNeedsReview: parsed.data.notifyOnPaymentNeedsReview,
        notifyOnCancellation: parsed.data.notifyOnCancellation,
        smsNotificationsEnabled: parsed.data.smsNotificationsEnabled,
      },
      select: {
        notifyOnNewBooking: true,
        notifyOnPaymentNeedsReview: true,
        notifyOnCancellation: true,
        smsNotificationsEnabled: true,
      },
    });
    await writeAuditEvent({ businessId: input.businessId, type: "notifications.updated", actorType: "user", actorId: input.actorUserId }, transaction);
    return updated;
  });
}
