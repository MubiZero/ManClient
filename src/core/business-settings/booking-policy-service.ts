import { requireSettingsAccess } from "@/core/business-settings/authorize-settings";
import { bookingPolicySchema } from "@/core/business-settings/setting-schemas";
import { SettingsError } from "@/core/business-settings/settings-error";
import { writeAuditEvent } from "@/core/audit/audit-service";
import { prisma } from "@/core/database/prisma";

/**
 * `cancellationPolicy` — the free-text paragraph — lives here rather than with the notification
 * settings it used to share a form with: the text explains the rules on the public page, the numbers
 * enforce them, and a business editing one almost always means to edit the other.
 */

const POLICY_SELECTION = {
  minLeadTimeMinutes: true,
  maxAdvanceDays: true,
  freeCancellationHours: true,
  maxCustomerReschedules: true,
  cancellationPolicy: true,
} as const;

export async function getBookingPolicySettings(businessId: string) {
  return prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: POLICY_SELECTION });
}

export async function updateBookingPolicySettings(input: {
  businessId: string;
  actorUserId: string;
  minLeadTimeMinutes: number | string;
  maxAdvanceDays?: number | string | null;
  freeCancellationHours: number | string;
  maxCustomerReschedules?: number | string | null;
  cancellationPolicy?: string;
}) {
  const parsed = bookingPolicySchema.safeParse({
    minLeadTimeMinutes: input.minLeadTimeMinutes,
    maxAdvanceDays: input.maxAdvanceDays,
    freeCancellationHours: input.freeCancellationHours,
    maxCustomerReschedules: input.maxCustomerReschedules,
    cancellationPolicy: input.cancellationPolicy,
  });
  if (!parsed.success) throw new SettingsError("INVALID_INPUT");

  return prisma.$transaction(async (transaction) => {
    await requireSettingsAccess(transaction, input);
    const updated = await transaction.business.update({
      where: { id: input.businessId },
      data: {
        minLeadTimeMinutes: parsed.data.minLeadTimeMinutes,
        maxAdvanceDays: parsed.data.maxAdvanceDays ?? null,
        freeCancellationHours: parsed.data.freeCancellationHours,
        maxCustomerReschedules: parsed.data.maxCustomerReschedules ?? null,
        cancellationPolicy: parsed.data.cancellationPolicy ?? null,
      },
      select: POLICY_SELECTION,
    });
    // Worth auditing: these numbers decide which bookings the business can still receive, and "the
    // calendar went empty on Tuesday" is a question this log answers.
    await writeAuditEvent(
      { businessId: input.businessId, type: "booking_policy.updated", actorType: "user", actorId: input.actorUserId, metadata: { ...updated } },
      transaction,
    );
    return updated;
  });
}
