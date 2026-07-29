import Link from "next/link";
import type { ReactElement, ReactNode } from "react";

type MarketingHomePageProps = {
  onboardingUrl: string | null;
};

const bookingJourney = [
  ["01", "Клиент выбирает услугу", "Открывает ссылку бизнеса, выбирает мастера или бокс и удобное время."],
  ["02", "Подтверждает запись оплатой", "Получает ссылку DushanbeCity и отправляет чек в Telegram."],
  ["03", "Получает напоминание", "ManClient напоминает о визите, чтобы запись не потерялась в переписке."],
  ["04", "Приходит в назначенное время", "Запись уже есть в календаре бизнеса со всеми нужными деталями."],
] as const;

const operatingSteps = [
  ["1", "Настройте бизнес", "Добавьте филиал, услуги, мастеров, рабочие боксы и расписание."],
  ["2", "Дайте клиентам ссылку", "Разместите её в Telegram, Instagram, на сайте или отправляйте в чат."],
  ["3", "Получайте подтверждённые записи", "Клиент выбирает время и оплачивает напрямую на карту бизнеса."],
] as const;

export function normalizeTelegramOnboardingUrl(value: string | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (url.hostname !== "t.me" && url.hostname !== "telegram.me") return null;
    if (url.pathname === "/") return null;

    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function MarketingHomePage({ onboardingUrl }: MarketingHomePageProps): ReactElement {
  return (
    <div className="marketing-page">
      <MarketingHeader onboardingUrl={onboardingUrl} />
      <main>
        <section className="marketing-hero" aria-labelledby="hero-title">
          <div className="marketing-container hero-layout">
            <div className="hero-copy">
              <h1 id="hero-title">Принимайте записи, пока занимаетесь бизнесом</h1>
              <p className="hero-intro">
                ManClient помогает салонам, барбершопам и автосервисам принимать записи,
                подтверждать оплату и напоминать клиентам о визите.
              </p>
              <div className="hero-actions">
                <OnboardingAction onboardingUrl={onboardingUrl} />
                <Link className="marketing-button marketing-button-secondary" href="/login">
                  Войти
                </Link>
              </div>
              <dl className="hero-facts" aria-label="Главные возможности">
                <div><dt>Запись</dt><dd>по ссылке бизнеса</dd></div>
                <div><dt>Оплата</dt><dd>напрямую бизнесу</dd></div>
                <div><dt>Напоминания</dt><dd>в привычных чатах</dd></div>
              </dl>
            </div>

            <div className="journey-panel" aria-label="Путь клиентской записи">
              <h2>Как выглядит путь записи</h2>
              <ol>
                {bookingJourney.map(([number, title, description]) => (
                  <li key={number}>
                    <span aria-hidden>{number}</span>
                    <div><h3>{title}</h3><p>{description}</p></div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section className="marketing-section process-section" id="how-it-works" aria-labelledby="process-title">
          <div className="marketing-container">
            <div className="section-heading">
              <h2 id="process-title">Как работает ManClient</h2>
              <p>От настройки расписания до подтверждённой записи, без ручного поиска свободного времени в переписке.</p>
            </div>
            <ol className="process-list">
              {operatingSteps.map(([number, title, description]) => (
                <li key={number}>
                  <span aria-hidden>{number}</span>
                  <div><h3>{title}</h3><p>{description}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="marketing-section channel-section" id="channels" aria-labelledby="channels-title">
          <div className="marketing-container channel-layout">
            <div className="section-heading channel-heading">
              <h2 id="channels-title">Клиенту привычно. Бизнесу спокойно.</h2>
              <p>ManClient связывает запись, подтверждение оплаты и напоминания в одном понятном процессе.</p>
            </div>
            <div className="channel-list">
              <ChannelItem label="Telegram" title="Telegram для записи">
                Клиент выбирает услугу и отправляет чек в чат. Интерактивный бот подключается после настройки бизнеса.
              </ChannelItem>
              <ChannelItem label="WhatsApp" title="WhatsApp для напоминаний">
                Бизнес сможет отправлять подтверждения и напоминания через согласованные шаблоны.
              </ChannelItem>
              <ChannelItem label="DC" title="DushanbeCity для оплаты">
                Деньги поступают напрямую вашему бизнесу. ManClient не хранит средства клиентов.
              </ChannelItem>
            </div>
          </div>
        </section>

        <section className="marketing-section business-section" id="businesses" aria-labelledby="business-title">
          <div className="marketing-container">
            <div className="section-heading business-heading">
              <h2 id="business-title">Подходит бизнесам, где время нужно бронировать</h2>
            </div>
            <div className="business-types">
              <article>
                <p className="business-number" aria-hidden>01</p>
                <h3>Салоны и барбершопы</h3>
                <p>Услуги разной длительности, графики мастеров, предоплата и напоминания клиентам.</p>
              </article>
              <article>
                <p className="business-number" aria-hidden>02</p>
                <h3>Автосервисы</h3>
                <p>Запись к специалисту и одновременное бронирование подъёмника, бокса или другого ресурса.</p>
              </article>
              <article>
                <p className="business-number" aria-hidden>03</p>
                <h3>Другие услуги по времени</h3>
                <p>Консультации, студии, аренда оборудования и любые услуги с мастером или отдельным местом.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="final-cta" aria-labelledby="final-cta-title">
          <div className="marketing-container final-cta-layout">
            <div>
              <h2 id="final-cta-title">Освободите переписку от ручной записи</h2>
              <p>Подключаем первые бизнесы вручную и помогаем настроить услуги, расписание и оплату.</p>
            </div>
            <OnboardingAction onboardingUrl={onboardingUrl} inverted />
          </div>
        </section>
      </main>

      <footer className="marketing-footer">
        <div className="marketing-container footer-layout">
          <Link className="wordmark footer-wordmark" href="/" aria-label="ManClient, на главную">
            <span aria-hidden>MC</span><strong>ManClient</strong>
          </Link>
          <p>Онлайн-запись для сервисного бизнеса в Таджикистане.</p>
          <Link href="/login">Войти в кабинет</Link>
        </div>
      </footer>
    </div>
  );
}

function MarketingHeader({ onboardingUrl }: MarketingHomePageProps): ReactElement {
  return (
    <header className="marketing-header">
      <div className="marketing-container header-layout">
        <Link className="wordmark" href="/" aria-label="ManClient, на главную">
          <span aria-hidden>MC</span><strong>ManClient</strong>
        </Link>
        <nav aria-label="Основная навигация">
          <a href="#how-it-works">Как работает</a>
          <a href="#channels">Каналы и оплата</a>
          <a href="#businesses">Для кого</a>
        </nav>
        <div className="header-actions">
          <Link className="header-login" href="/login">Войти</Link>
          {onboardingUrl ? (
            <a className="marketing-button marketing-button-primary header-cta" href={onboardingUrl} rel="noreferrer" target="_blank">
              Подключить бизнес
            </a>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function OnboardingAction({ onboardingUrl, inverted = false }: MarketingHomePageProps & { inverted?: boolean }): ReactElement {
  if (!onboardingUrl) {
    return <p className={inverted ? "onboarding-fallback onboarding-fallback-inverted" : "onboarding-fallback"}>Подключаем первые бизнесы вручную</p>;
  }

  return (
    <a
      className={`marketing-button ${inverted ? "marketing-button-light" : "marketing-button-primary"}`}
      href={onboardingUrl}
      rel="noreferrer"
      target="_blank"
    >
      Подключить бизнес
    </a>
  );
}

function ChannelItem({ label, title, children }: { label: string; title: string; children: ReactNode }): ReactElement {
  return (
    <article>
      <span aria-hidden>{label}</span>
      <div><h3>{title}</h3><p>{children}</p></div>
    </article>
  );
}
