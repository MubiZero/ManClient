import type { BillingPeriod, SubscriptionPlan } from "@/generated/prisma/client";

/**
 * Names for plans and billing periods, kept in a module of their own because the client components
 * that show them must not drag in the services next door: those import `prisma`, and a client bundle
 * that reaches for the Postgres driver does not build at all.
 */
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

export const PERIOD_LABELS: Record<BillingPeriod, string> = {
  MONTHLY: "Месяц",
  YEARLY: "Год",
};
