import type { Prisma } from "@/generated/prisma/client";

import { requireSettingsAccess } from "@/core/business-settings/authorize-settings";
import { promoCodeInputSchema } from "@/core/business-settings/setting-schemas";
import { SettingsError } from "@/core/business-settings/settings-error";
import { writeAuditEvent } from "@/core/audit/audit-service";
import { prisma } from "@/core/database/prisma";
import { requirePlanFeature } from "@/core/platform/subscription-plans";

type PromoDatabase = Pick<Prisma.TransactionClient, "promoCode" | "promoCodeRedemption" | "business" | "membership" | "auditEvent">;

export type PromoValidationResult =
  | { valid: true; discountDiram: number; finalAmountDiram: number; promoCodeId: string }
  | { valid: false; reason: "NOT_FOUND" | "EXPIRED" | "INACTIVE" | "LIMIT_REACHED" };

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function validatePromoCode(
  input: { businessId: string; code: string; serviceAmountDiram: number },
  database: Pick<Prisma.TransactionClient, "promoCode"> = prisma,
): Promise<PromoValidationResult> {
  const code = normalizeCode(input.code);
  const promoCode = await database.promoCode.findUnique({
    where: { businessId_code: { businessId: input.businessId, code } },
  });

  if (!promoCode) return { valid: false, reason: "NOT_FOUND" };
  if (!promoCode.isActive) return { valid: false, reason: "INACTIVE" };
  if (promoCode.expiresAt && promoCode.expiresAt.getTime() <= Date.now()) return { valid: false, reason: "EXPIRED" };
  if (promoCode.maxRedemptions !== null && promoCode.redemptionCount >= promoCode.maxRedemptions) {
    return { valid: false, reason: "LIMIT_REACHED" };
  }

  const discountDiram =
    promoCode.discountType === "PERCENT"
      ? Math.min(input.serviceAmountDiram, Math.round((input.serviceAmountDiram * promoCode.discountValue) / 100))
      : Math.min(input.serviceAmountDiram, promoCode.discountValue);
  const finalAmountDiram = Math.max(0, input.serviceAmountDiram - discountDiram);

  return { valid: true, discountDiram, finalAmountDiram, promoCodeId: promoCode.id };
}

export async function redeemPromoCode(
  input: { businessId: string; code: string; bookingId: string; serviceAmountDiram: number },
  transaction: PromoDatabase,
): Promise<{ discountDiram: number; finalAmountDiram: number }> {
  const result = await validatePromoCode(
    { businessId: input.businessId, code: input.code, serviceAmountDiram: input.serviceAmountDiram },
    transaction,
  );
  if (!result.valid) {
    throw new SettingsError("INVALID_INPUT", { reason: result.reason });
  }

  await transaction.promoCode.update({
    where: { id: result.promoCodeId },
    data: { redemptionCount: { increment: 1 } },
  });
  await transaction.promoCodeRedemption.create({
    data: {
      promoCodeId: result.promoCodeId,
      bookingId: input.bookingId,
      discountAppliedDiram: result.discountDiram,
    },
  });

  return { discountDiram: result.discountDiram, finalAmountDiram: result.finalAmountDiram };
}

export async function listPromoCodes(businessId: string) {
  return prisma.promoCode.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createPromoCode(
  input: {
    businessId: string;
    actorUserId: string;
    code: string;
    discountType: "PERCENT" | "FIXED";
    discountValue: number;
    maxRedemptions?: number;
    expiresAt?: Date;
  },
) {
  const parsed = promoCodeInputSchema.safeParse({
    code: input.code,
    discountType: input.discountType,
    discountValue: input.discountValue,
    maxRedemptions: input.maxRedemptions,
    expiresAt: input.expiresAt,
  });
  if (!parsed.success) throw new SettingsError("INVALID_INPUT");

  return prisma.$transaction(async (transaction) => {
    await requireSettingsAccess(transaction, input);
    const business = await transaction.business.findUniqueOrThrow({
      where: { id: input.businessId },
      select: { subscriptionPlan: true },
    });
    requirePlanFeature(business.subscriptionPlan, "PROMO_CODES");

    const code = normalizeCode(parsed.data.code);
    const existing = await transaction.promoCode.findUnique({
      where: { businessId_code: { businessId: input.businessId, code } },
    });
    if (existing) throw new SettingsError("INVALID_INPUT", { reason: "DUPLICATE_CODE" });

    const created = await transaction.promoCode.create({
      data: {
        businessId: input.businessId,
        code,
        discountType: parsed.data.discountType,
        discountValue: parsed.data.discountValue,
        maxRedemptions: parsed.data.maxRedemptions ?? null,
        expiresAt: parsed.data.expiresAt ?? null,
      },
    });
    await writeAuditEvent(
      { businessId: input.businessId, type: "promo_code.created", actorType: "user", actorId: input.actorUserId, metadata: { promoCodeId: created.id, code } },
      transaction,
    );
    return created;
  });
}

export async function deactivatePromoCode(businessId: string, promoCodeId: string, actorUserId: string) {
  return prisma.$transaction(async (transaction) => {
    await requireSettingsAccess(transaction, { businessId, actorUserId });
    const promoCode = await transaction.promoCode.findFirst({ where: { id: promoCodeId, businessId } });
    if (!promoCode) throw new SettingsError("NOT_FOUND");

    const updated = await transaction.promoCode.update({
      where: { id: promoCodeId },
      data: { isActive: false },
    });
    await writeAuditEvent(
      { businessId, type: "promo_code.deactivated", actorType: "user", actorId: actorUserId, metadata: { promoCodeId } },
      transaction,
    );
    return updated;
  });
}
