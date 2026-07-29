import Link from "next/link";

const steps = [
  { number: "1", title: "Бизнес готов к первым записям", description: "Основной филиал, расписание, первая услуга, специалист и карта оплаты настроены.", href: "/dashboard", action: "Открыть кабинет" },
  { number: "2", title: "Подключите клиентского бота", description: "Это дополнительный канал. Создайте отдельного бота бизнеса в @BotFather и подключите token здесь.", href: "/dashboard/settings/integrations", action: "Настроить Telegram" },
] as const;

export function OnboardingChecklist() {
  return (
    <div className="onboarding-checklist">
      {steps.map(step => (
        <article key={step.number}>
          <span aria-hidden>{step.number}</span>
          <div><h2>{step.title}</h2><p>{step.description}</p><Link className="secondary-link" href={step.href}>{step.action}</Link></div>
        </article>
      ))}
    </div>
  );
}
