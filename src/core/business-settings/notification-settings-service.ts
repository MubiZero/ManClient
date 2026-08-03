import { requireSettingsAccess } from "@/core/business-settings/authorize-settings";
import { notificationSettingsSchema } from "@/core/business-settings/setting-schemas";
import { SettingsError } from "@/core/business-settings/settings-error";
import { writeAuditEvent } from "@/core/audit/audit-service";
import { prisma } from "@/core/database/prisma";

export async function getNotificationSettings(businessId: string) {
  return prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: {
      notifyOnNewBooking: true,
      notifyOnPaymentNeedsReview: true,
      notifyOnCancellation: true,
      cancellationPolicy: true,
    },
  });
}

export async function updateNotificationSettings(input: {
  businessId: string;
  actorUserId: string;
  notifyOnNewBooking: boolean;
  notifyOnPaymentNeedsReview: boolean;
  notifyOnCancellation: boolean;
  cancellationPolicy?: string;
}) {
  const parsed = notificationSettingsSchema.safeParse({
    notifyOnNewBooking: input.notifyOnNewBooking,
    notifyOnPaymentNeedsReview: input.notifyOnPaymentNeedsReview,
    notifyOnCancellation: input.notifyOnCancellation,
    cancellationPolicy: input.cancellationPolicy,
  });
  if (!parsed.success) throw new SettingsError("INVALID_INPUT");

  return prisma.$transaction(async (transaction) => {
    await requireSettingsAccess(transaction, input);
    const updated = await transaction.business.update({
      where: { id: input.businessId },
      data: {
        notifyOnNewBooking: parsed.data.notifyOnNewBooking,
        notifyOnPaymentNeedsReview: parsed.data.notifyOnPaymentNeedsReview,
        notifyOnCancellation: parsed.data.notifyOnCancellation,
        cancellationPolicy: parsed.data.cancellationPolicy ?? null,
      },
      select: {
        notifyOnNewBooking: true,
        notifyOnPaymentNeedsReview: true,
        notifyOnCancellation: true,
        cancellationPolicy: true,
      },
    });
    await writeAuditEvent({ businessId: input.businessId, type: "notifications.updated", actorType: "user", actorId: input.actorUserId }, transaction);
    return updated;
  });
}
