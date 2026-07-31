import { Bell, Calendar, CreditCard, MessageCircle, Scissors, Send, Wrench } from "lucide-react";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";

import { ButtonLink } from "@/features/ui-kit/button";
import { Card, CardContent } from "@/features/ui-kit/card";

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

export function MarketingHomePage(): ReactElement {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingHeader />
      <main>
        <section
          className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-background to-background dark:from-brand-950/30 dark:via-background dark:to-background"
          aria-labelledby="hero-title"
        >
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start lg:gap-16 lg:py-24">
            <div className="flex flex-col gap-6">
              <h1 id="hero-title" className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                Принимайте записи, пока занимаетесь бизнесом
              </h1>
              <p className="max-w-xl text-lg text-muted-foreground">
                ManClient помогает салонам, барбершопам и автосервисам принимать записи,
                подтверждать оплату и напоминать клиентам о визите.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <OnboardingAction />
                <ButtonLink href="/login" variant="secondary" size="lg">
                  Войти
                </ButtonLink>
              </div>
              <dl className="hero-facts mt-2 grid grid-cols-1 gap-3 border-t border-border pt-6 sm:grid-cols-3 sm:gap-4" aria-label="Главные возможности">
                <HeroFact icon={Calendar} term="Запись" description="по ссылке бизнеса" />
                <HeroFact icon={CreditCard} term="Оплата" description="напрямую бизнесу" />
                <HeroFact icon={Bell} term="Напоминания" description="в привычных чатах" />
              </dl>
            </div>

            <Card className="bg-card/80 backdrop-blur" aria-label="Путь клиентской записи">
              <CardContent className="p-6">
                <h2 className="mb-5 text-base font-semibold text-foreground">Как выглядит путь записи</h2>
                <ol className="flex flex-col gap-5">
                  {bookingJourney.map(([number, title, description]) => (
                    <li key={number} className="flex gap-4">
                      <span
                        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-300"
                        aria-hidden
                      >
                        {number}
                      </span>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>
        </section>

        <section
          className="mx-auto max-w-6xl px-4 py-16 sm:px-6"
          id="how-it-works"
          aria-labelledby="process-title"
        >
          <SectionHeading
            id="process-title"
            title="Как работает ManClient"
            description="От настройки расписания до подтверждённой записи, без ручного поиска свободного времени в переписке."
          />
          <ol className="mt-10 grid gap-6 sm:grid-cols-3">
            {operatingSteps.map(([number, title, description]) => (
              <li key={number}>
                <Card className="h-full">
                  <CardContent className="flex h-full flex-col gap-3 p-6">
                    <span
                      className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
                      aria-hidden
                    >
                      {number}
                    </span>
                    <h3 className="text-base font-semibold text-foreground">{title}</h3>
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        <section
          className="border-y border-border bg-secondary/40"
          id="channels"
          aria-labelledby="channels-title"
        >
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <SectionHeading
              id="channels-title"
              title="Клиенту привычно. Бизнесу спокойно."
              description="ManClient связывает запись, подтверждение оплаты и напоминания в одном понятном процессе."
            />
            <div className="mt-10 grid gap-6 sm:grid-cols-3">
              <ChannelItem icon={Send} title="Telegram для записи">
                Клиент выбирает услугу и отправляет чек в чат. Интерактивный бот подключается после настройки бизнеса.
              </ChannelItem>
              <ChannelItem icon={MessageCircle} title="WhatsApp для напоминаний">
                Бизнес сможет отправлять подтверждения и напоминания через согласованные шаблоны.
              </ChannelItem>
              <ChannelItem icon={CreditCard} title="DushanbeCity для оплаты">
                Деньги поступают напрямую вашему бизнесу. ManClient не хранит средства клиентов.
              </ChannelItem>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" id="businesses" aria-labelledby="business-title">
          <SectionHeading id="business-title" title="Подходит бизнесам, где время нужно бронировать" />
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            <BusinessType icon={Scissors} number="01" title="Салоны и барбершопы">
              Услуги разной длительности, графики мастеров, предоплата и напоминания клиентам.
            </BusinessType>
            <BusinessType icon={Wrench} number="02" title="Автосервисы">
              Запись к специалисту и одновременное бронирование подъёмника, бокса или другого ресурса.
            </BusinessType>
            <BusinessType icon={Calendar} number="03" title="Другие услуги по времени">
              Консультации, студии, аренда оборудования и любые услуги с мастером или отдельным местом.
            </BusinessType>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6" aria-labelledby="final-cta-title">
          <Card className="overflow-hidden bg-gradient-to-br from-brand-600 to-brand-800 text-brand-50 shadow-md">
            <CardContent className="flex flex-col items-start gap-6 p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
              <div>
                <h2 id="final-cta-title" className="text-2xl font-bold text-white">
                  Освободите переписку от ручной записи
                </h2>
                <p className="mt-2 max-w-lg text-brand-100">
                  Создайте кабинет на сайте и настройте услуги, расписание и оплату в удобном порядке.
                </p>
              </div>
              <OnboardingAction inverted />
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-10 text-center sm:flex-row sm:justify-between sm:px-6 sm:text-left">
          <Link href="/" className="flex items-center gap-2 font-semibold text-foreground" aria-label="ManClient, на главную">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground" aria-hidden>
              MC
            </span>
            ManClient
          </Link>
          <p className="text-sm text-muted-foreground">Онлайн-запись для сервисного бизнеса в Таджикистане.</p>
          <Link href="/login" className="text-sm font-medium text-primary hover:underline">
            Войти в кабинет
          </Link>
        </div>
      </footer>
    </div>
  );
}

function MarketingHeader(): ReactElement {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-foreground" aria-label="ManClient, на главную">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground" aria-hidden>
            MC
          </span>
          ManClient
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex" aria-label="Основная навигация">
          <a href="#how-it-works" className="hover:text-foreground">Как работает</a>
          <a href="#channels" className="hover:text-foreground">Каналы и оплата</a>
          <a href="#businesses" className="hover:text-foreground">Для кого</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:inline">
            Войти
          </Link>
          <ButtonLink href="/register" size="sm">
            Подключить бизнес
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}

function OnboardingAction({ inverted = false }: { inverted?: boolean }): ReactElement {
  return (
    <ButtonLink
      href="/register"
      size="lg"
      variant={inverted ? "secondary" : "primary"}
      className={inverted ? "shrink-0 border-transparent bg-white text-brand-800 hover:bg-brand-50" : undefined}
    >
      Подключить бизнес
    </ButtonLink>
  );
}

function SectionHeading({ id, title, description }: { id: string; title: string; description?: string }): ReactElement {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 id={id} className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {title}
      </h2>
      {description ? <p className="mt-3 text-muted-foreground">{description}</p> : null}
    </div>
  );
}

function HeroFact({
  icon: Icon,
  term,
  description,
}: {
  icon: typeof Calendar;
  term: string;
  description: string;
}): ReactElement {
  return (
    <div className="flex items-baseline gap-4">
      <dt className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-foreground">
        <Icon className="size-4 text-primary" aria-hidden />
        {term}
      </dt>
      <dd className="text-sm text-muted-foreground">{description}</dd>
    </div>
  );
}

function ChannelItem({ icon: Icon, title, children }: { icon: typeof Send; title: string; children: ReactNode }): ReactElement {
  return (
    <Card className="bg-card">
      <CardContent className="flex flex-col gap-3 p-6">
        <span className="flex size-10 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300" aria-hidden>
          <Icon className="size-5" />
        </span>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{children}</p>
      </CardContent>
    </Card>
  );
}

function BusinessType({
  icon: Icon,
  number,
  title,
  children,
}: {
  icon: typeof Scissors;
  number: string;
  title: string;
  children: ReactNode;
}): ReactElement {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-6">
        <div className="flex items-center justify-between">
          <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground" aria-hidden>
            <Icon className="size-5" />
          </span>
          <span className="text-sm font-semibold text-muted-foreground" aria-hidden>
            {number}
          </span>
        </div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{children}</p>
      </CardContent>
    </Card>
  );
}
