import type { SubscriptionPlan } from "@/generated/prisma/client";
import { SettingsError } from "@/core/business-settings/settings-error";
import { prisma } from "@/core/database/prisma";

export type PlanFeature = "SMS" | "WAITLIST" | "PROMO_CODES" | "RECURRING_BOOKINGS" | "STAFF_COMMISSIONS" | "REVIEWS";

const PLAN_FEATURES: Record<SubscriptionPlan, ReadonlySet<PlanFeature>> = {
  START: new Set(),
  STANDARD: new Set(["SMS", "WAITLIST", "PROMO_CODES"]),
  PREMIUM: new Set(["SMS", "WAITLIST", "PROMO_CODES", "RECURRING_BOOKINGS", "STAFF_COMMISSIONS", "REVIEWS"]),
};

export const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  START: "Старт",
  STANDARD: "Стандарт",
  PREMIUM: "Премиум",
};

export const PLAN_DESCRIPTIONS: Record<SubscriptionPlan, string> = {
  START: "Базовые записи, дашборд, WhatsApp и Telegram-бот.",
  STANDARD: "Всё из Старта + SMS-уведомления, лист ожидания, промокоды.",
  PREMIUM: "Всё из Стандарта + повторяющиеся записи, комиссии персонала, отзывы и рейтинги.",
};

export function businessHasFeature(plan: SubscriptionPlan, feature: PlanFeature): boolean {
  return PLAN_FEATURES[plan].has(feature);
}

export function requirePlanFeature(plan: SubscriptionPlan, feature: PlanFeature): void {
  if (!businessHasFeature(plan, feature)) throw new SettingsError("PLAN_REQUIRED", { feature });
}

export function featuresForPlan(plan: SubscriptionPlan): PlanFeature[] {
  return [...PLAN_FEATURES[plan]];
}

export async function getBusinessPlanSummary(businessId: string) {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { subscriptionPlan: true } });
  return { plan: business.subscriptionPlan, features: featuresForPlan(business.subscriptionPlan) };
}
