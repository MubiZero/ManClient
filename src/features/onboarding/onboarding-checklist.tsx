import Link from "next/link";

export function OnboardingChecklist({ businessSlug }: { businessSlug: string }) {
  const bookingPath = `/b/${businessSlug}`;
  return (
    <div className="onboarding-checklist">
      <div className="onboarding-success-mark" aria-hidden>✓</div>
      <p className="step-kicker">Настройка завершена</p>
      <h2>Бизнес готов к первым записям</h2>
      <p>Услуга, расписание и получение оплаты настроены. Проверьте страницу, которую увидят ваши клиенты.</p>
      <Link className="booking-link-preview" href={bookingPath}><span>Ваша ссылка для записи</span><strong>{bookingPath}</strong></Link>
      <div className="onboarding-ready-actions">
        <Link className="primary-link" href="/dashboard">Открыть кабинет</Link>
        <Link className="secondary-link" href="/dashboard/settings/integrations">Подключить Telegram</Link>
      </div>
    </div>
  );
}
