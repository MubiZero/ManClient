import Link from "next/link";

type Readiness = { service: boolean; staff: boolean; schedule: boolean; payment: boolean; telegram: boolean };

const defaultReadiness: Readiness = { service: true, staff: true, schedule: true, payment: true, telegram: false };

export function OnboardingChecklist({ businessSlug, readiness = defaultReadiness }: { businessSlug: string; readiness?: Readiness }) {
  const bookingPath = `/b/${businessSlug}`;
  const readyForBooking = readiness.service && readiness.staff && readiness.schedule;
  const items = [
    { ready: readiness.service, label: "Опубликовать услугу", href: "/dashboard/settings/services" },
    { ready: readiness.staff, label: "Добавить специалиста", href: "/dashboard/settings/staff" },
    { ready: readiness.schedule, label: "Настроить расписание", href: "/dashboard/settings/schedule" },
    { ready: readiness.payment, label: "Настроить оплату", href: "/dashboard/onboarding" },
    { ready: readiness.telegram, label: "Подключить Telegram", href: "/dashboard/settings/integrations" },
  ];

  return <div className="onboarding-checklist">
    <div className="onboarding-success-mark" aria-hidden>{readyForBooking ? "✓" : items.filter((item) => item.ready).length}</div>
    <p className="step-kicker">{readyForBooking ? "Готово для записи" : "Проверка готовности"}</p>
    <h2>{readyForBooking ? "Клиенты уже могут записываться" : "Завершите основные настройки"}</h2>
    <p>{readyForBooking ? "Основные данные готовы. Оплата и Telegram подключаются отдельно и не блокируют страницу записи." : "Показываем только реальные шаги. Когда услуга, специалист и расписание готовы, ссылка начнёт принимать записи."}</p>
    <div className="readiness-list">
      {items.map((item) => <Link key={item.label} href={item.href} className={item.ready ? "is-ready" : undefined}>
        <span aria-hidden>{item.ready ? "✓" : "○"}</span><strong>{item.label}</strong><small>{item.ready ? "Готово" : "Перейти"}</small>
      </Link>)}
    </div>
    <Link className="booking-link-preview" href={bookingPath} aria-disabled={!readyForBooking}><span>Ваша ссылка для записи</span><strong>{bookingPath}</strong></Link>
    <div className="onboarding-ready-actions"><Link className="primary-link" href="/dashboard">Открыть кабинет</Link><Link className="secondary-link" href="/dashboard/settings/integrations">К каналам</Link></div>
  </div>;
}
