import { requireSettingsAccess } from "@/core/business-settings/authorize-settings";
import { bookingPolicySchema } from "@/core/business-settings/setting-schemas";
import { SettingsError } from "@/core/business-settings/settings-error";
import { writeAuditEvent } from "@/core/audit/audit-service";
import { prisma } from "@/core/database/prisma";
import { parseSomoniToDiram } from "@/core/formatting/money";

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
  prepaymentMode: true,
  depositPercent: true,
  depositAmountDiram: true,
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
  prepaymentMode?: "FULL" | "DEPOSIT" | "NONE";
  depositPercent?: number | string | null;
  depositSomoni?: string | null;
}) {
  const parsed = bookingPolicySchema.safeParse({
    minLeadTimeMinutes: input.minLeadTimeMinutes,
    maxAdvanceDays: input.maxAdvanceDays,
    freeCancellationHours: input.freeCancellationHours,
    maxCustomerReschedules: input.maxCustomerReschedules,
    cancellationPolicy: input.cancellationPolicy,
    prepaymentMode: input.prepaymentMode,
    depositPercent: input.depositPercent,
    depositSomoni: input.depositSomoni,
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
        prepaymentMode: parsed.data.prepaymentMode,
        // Cleared together with the mode: leaving a stale deposit amount behind would resurrect it the
        // next time somebody switched the mode back, with a number nobody had looked at in months.
        depositPercent: parsed.data.prepaymentMode === "DEPOSIT" ? parsed.data.depositPercent ?? null : null,
        depositAmountDiram: parsed.data.prepaymentMode === "DEPOSIT" && parsed.data.depositSomoni ? parseSomoniToDiram(parsed.data.depositSomoni) : null,
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
