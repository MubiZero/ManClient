import type { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma/client";

import { GRACE_DAYS } from "@/core/platform/subscription-lifecycle";

const DAY_MS = 86_400_000;

export type SubscriptionSummary = {
  statusLabel: string;
  detail: string;
  tone: "neutral" | "warning" | "danger";
};

/**
 * What the cabinet says about the subscription, in one place because three surfaces ask the same
 * question — the plan page, the grace banner and the invoice panel — and they must not answer it
 * differently.
 */
export function subscriptionSummary(
  subscription: { plan: SubscriptionPlan; status: SubscriptionStatus; endsAt: Date | null },
  now = new Date(),
): SubscriptionSummary {
  if (!subscription.endsAt) {
    return { statusLabel: statusLabel(subscription.status), detail: "Бессрочный доступ.", tone: "neutral" };
  }

  switch (subscription.status) {
    case "TRIALING": {
      const days = daysBetween(now, subscription.endsAt);
      return {
        statusLabel: "Пробный период",
        detail: `Полный доступ до ${formatDate(subscription.endsAt)} — ${daysLeftPhrase(days)}. Дальше нужен оплаченный тариф.`,
        tone: days <= 3 ? "warning" : "neutral",
      };
    }
    case "ACTIVE":
      return {
        statusLabel: "Активна",
        detail: `Оплачена по ${formatDate(subscription.endsAt)}.`,
        tone: daysBetween(now, subscription.endsAt) <= 3 ? "warning" : "neutral",
      };
    case "GRACE": {
      // Grace takes nothing away yet; the date is when it will, and the point of saying so early.
      const disableAt = new Date(subscription.endsAt.getTime() + GRACE_DAYS * DAY_MS);
      return {
        statusLabel: "Оплата просрочена",
        detail: `Период закончился ${formatDate(subscription.endsAt)}. Пока работает всё, но ${formatDate(disableAt)} отключатся платные функции: SMS, лист ожидания, промокоды, повторяющиеся записи, комиссии и отзывы.`,
        tone: "danger",
      };
    }
    case "EXPIRED":
      return {
        statusLabel: "Закончилась",
        detail: "Платные функции отключены. Записи, клиенты и история на месте — оплатите счёт, и всё вернётся.",
        tone: "danger",
      };
  }
}

/** When grace will actually switch the paid features off, or null when nothing is pending. */
export function graceDisableAt(subscription: { status: SubscriptionStatus; endsAt: Date | null }): Date | null {
  if (subscription.status !== "GRACE" || !subscription.endsAt) return null;
  return new Date(subscription.endsAt.getTime() + GRACE_DAYS * DAY_MS);
}

function statusLabel(status: SubscriptionStatus): string {
  return { TRIALING: "Пробный период", ACTIVE: "Активна", GRACE: "Оплата просрочена", EXPIRED: "Закончилась" }[status];
}

export function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Dushanbe", day: "2-digit", month: "2-digit", year: "numeric" }).format(value);
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / DAY_MS));
}

function daysLeftPhrase(days: number): string {
  if (days === 0) return "последний день";
  const lastTwo = days % 100;
  const last = days % 10;
  const noun = lastTwo >= 11 && lastTwo <= 14 ? "дней" : last === 1 ? "день" : last >= 2 && last <= 4 ? "дня" : "дней";
  return `осталось ${days} ${noun}`;
}
