"use client";

import Link from "next/link";
import { useState } from "react";

import { formatDate } from "@/features/dashboard/subscription/subscription-summary";

/**
 * Says what is about to stop working and when, on every page rather than only on the plan page — a
 * business that has stopped paying is not going to visit the billing screen to find out. It closes
 * for the session: pushy enough to be read, not so pushy that it gets in the way of a working day.
 */
export function GraceBanner({ disableAt }: { disableAt: Date }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700 dark:border-danger-700 dark:bg-danger-600/10 dark:text-danger-500"
    >
      <span>
        Подписка не оплачена. {formatDate(disableAt)} отключатся SMS-уведомления, лист ожидания, промокоды, повторяющиеся записи,
        комиссии персонала и отзывы. Записи, клиенты и история останутся.
      </span>
      <Link href="/dashboard/settings/plan" className="font-medium underline underline-offset-2">
        Оплатить
      </Link>
      <button type="button" onClick={() => setDismissed(true)} className="ml-auto font-medium underline underline-offset-2">
        Скрыть
      </button>
    </div>
  );
}
