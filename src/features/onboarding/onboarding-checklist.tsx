import Link from "next/link";

import { BookingLinkActions } from "@/features/onboarding/booking-link-actions";

type Readiness = { service: boolean; staff: boolean; schedule: boolean; payment: boolean; telegram: boolean };

const defaultReadiness: Readiness = { service: true, staff: true, schedule: true, payment: true, telegram: false };

export function OnboardingChecklist({ businessSlug, readiness = defaultReadiness }: { businessSlug: string; readiness?: Readiness }) {
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

  return <div className="onboarding-checklist">
    <div className={readyForBooking ? "onboarding-success-mark" : "onboarding-pending-mark"} aria-hidden>{readyForBooking ? "✓" : requiredActions.length}</div>
    <p className="step-kicker">{readyForBooking ? "Запись запущена" : "Осталось подготовить страницу"}</p>
    <h2>{readyForBooking ? "Страница записи работает" : "Завершите запуск страницы"}</h2>
    <p>{readyForBooking ? "Клиенты уже могут выбирать услугу, специалиста и свободное время." : "Выполните обязательные настройки, чтобы клиенты увидели доступное время для записи."}</p>
    {readyForBooking ? <BookingLinkActions bookingPath={bookingPath} /> : (
      <div className="onboarding-required-actions">
        {requiredActions.map(item => <Link key={item.label} href={item.href}>{item.label}<span>Перейти</span></Link>)}
      </div>
    )}
    <section className={`onboarding-channel-card${readiness.telegram ? " is-connected" : ""}`} aria-labelledby="telegram-channel-title">
      <div>
        <p className="context-label">Дополнительный канал</p>
        <h3 id="telegram-channel-title">{readiness.telegram ? "Telegram подключён" : "Добавьте запись через Telegram"}</h3>
        <p>{readiness.telegram ? "Клиенты могут записываться через вашего клиентского бота." : "Клиенты смогут записываться в привычном чате, а команда продолжит работать через @manclient_bot."}</p>
      </div>
      <Link className={readiness.telegram ? "secondary-link" : "primary-link"} href="/dashboard/settings/integrations">
        {readiness.telegram ? "Открыть интеграции" : "Создать клиентского бота"}
      </Link>
    </section>
  </div>;
}
