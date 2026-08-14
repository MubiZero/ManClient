import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { BookingLinkActions } from "@/features/onboarding/booking-link-actions";
import { ButtonLink } from "@/features/ui-kit/button";
import { Card } from "@/features/ui-kit/card";
import { cn } from "@/features/ui-kit/cn";

type Readiness = { service: boolean; staff: boolean; schedule: boolean; payment: boolean; telegram: boolean };

export function OnboardingChecklist({ businessSlug, readiness }: { businessSlug: string; readiness: Readiness }) {
  const bookingPath = `/b/${businessSlug}`;
  const readyForBooking = readiness.service && readiness.staff && readiness.schedule && readiness.payment;
  // `payment` is false only when something would ask the customer for money and there is no card to
  // send it to — a booking in that state is refused, so it belongs with the blockers rather than with
  // the nice-to-haves. A salon that takes payment on the premises never sees this line.
  const requiredActions = [
    !readiness.service ? { label: "Опубликовать услугу", href: "/dashboard/settings/services" } : null,
    !readiness.staff ? { label: "Добавить специалиста", href: "/dashboard/settings/staff" } : null,
    !readiness.schedule ? { label: "Настроить расписание", href: "/dashboard/settings/schedule" } : null,
    !readiness.payment ? { label: "Добавить карту для предоплаты", href: "/dashboard/settings/branches" } : null,
  ].filter((item): item is { label: string; href: string } => Boolean(item));

  return (
    <Card>
      <div className="flex flex-col gap-6 p-6">
        <div
          className={cn(
            "flex size-12 items-center justify-center rounded-full text-lg font-bold",
            readyForBooking ? "bg-primary text-primary-foreground" : "border border-border bg-secondary text-foreground",
          )}
          aria-hidden
        >
          {readyForBooking ? "✓" : requiredActions.length}
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            {readyForBooking ? "Запись запущена" : "Осталось подготовить страницу"}
          </p>
          <h2 className="text-xl font-semibold text-foreground">
            {readyForBooking ? "Страница записи работает" : "Завершите запуск страницы"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {readyForBooking
              ? "Клиенты уже могут выбирать услугу, специалиста и свободное время."
              : "Выполните обязательные настройки, чтобы клиенты увидели доступное время для записи."}
          </p>
        </div>
        {readyForBooking ? <BookingLinkActions bookingPath={bookingPath} /> : (
          <div className="flex flex-col gap-2">
            {requiredActions.map(item => (
              <Link
                className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={item.href}
                key={item.label}
              >
                {item.label}
                <span className="flex items-center gap-1 text-[13px] font-normal text-muted-foreground">
                  Перейти
                  <ChevronRight className="size-4" aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        )}
        <section
          className={cn(
            "flex flex-col gap-4 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between",
            readiness.telegram ? "border-brand-200 bg-accent dark:border-brand-900" : "border-border bg-card",
          )}
          aria-labelledby="telegram-channel-title"
        >
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Дополнительный канал</p>
            <h3 className="text-sm font-semibold text-foreground" id="telegram-channel-title">
              {readiness.telegram ? "Telegram подключён" : "Добавьте запись через Telegram"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {readiness.telegram
                ? "Клиенты могут записываться через вашего клиентского бота."
                : "Клиенты смогут записываться в привычном чате, а команда продолжит работать через @manclient_bot."}
            </p>
          </div>
          <ButtonLink
            className="w-full shrink-0 sm:w-auto"
            variant={readiness.telegram ? "secondary" : "primary"}
            href="/dashboard/settings/integrations"
          >
            {readiness.telegram ? "Открыть интеграции" : "Создать клиентского бота"}
          </ButtonLink>
        </section>
      </div>
    </Card>
  );
}
