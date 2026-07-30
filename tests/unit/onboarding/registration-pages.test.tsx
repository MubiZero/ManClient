import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OnboardingChecklist } from "@/features/onboarding/onboarding-checklist";
import { OnboardingProgress } from "@/features/onboarding/onboarding-progress";
import { OnboardingSubmitButton } from "@/features/onboarding/onboarding-submit-button";
import { PaymentSetupForm } from "@/features/onboarding/payment-setup-form";
import { RegistrationForm } from "@/features/onboarding/registration-form";
import { ServiceSetupForm } from "@/features/onboarding/service-setup-form";

describe("web business onboarding", () => {
  it("collects the tenant owner and business data with persistent labels", () => {
    const html = renderToStaticMarkup(<RegistrationForm action={async () => undefined} />);

    expect(html).toContain("Ваше имя");
    expect(html).toContain("+992");
    expect(html).toContain("__ ___ __ __");
    expect(html).not.toContain("Электронная почта");
    expect(html).toContain("Название бизнеса");
    expect(html).not.toContain("Основной филиал");
    expect(html).toContain('autoComplete="new-password"');
    expect(html).toContain('minLength="8"');
    expect(html).toContain("Минимум 8 символов");
    expect(html).toContain('href="/login"');
  });

  it("offers real next steps inside the dashboard", () => {
    const html = renderToStaticMarkup(<OnboardingChecklist businessSlug="salon-sino" />);

    expect(html).toContain("Страница записи работает");
    expect(html).toContain("Ссылка для клиентов");
    expect(html).toContain("Отправьте её клиентам или разместите в Instagram, Telegram и на сайте");
    expect(html).toContain("Открыть страницу");
    expect(html).toContain("Скопировать ссылку");
    expect(html).toContain("Добавьте запись через Telegram");
    expect(html).toContain('href="/dashboard/settings/integrations"');
    expect(html).toContain('href="/b/salon-sino"');
    expect(html).toContain("Создать клиентского бота");
    expect(html).not.toContain("Ваша ссылка для записи");
    expect(html).not.toContain("Открыть кабинет");
    expect(html).not.toContain("К каналам");
    expect(html).not.toContain("readiness-list");
  });

  it("shows a compact Telegram state after the channel is connected", () => {
    const html = renderToStaticMarkup(<OnboardingChecklist businessSlug="salon-sino" readiness={{
      service: true, staff: true, schedule: true, payment: true, telegram: true,
    }} />);

    expect(html).toContain("Telegram подключён");
    expect(html).toContain("Открыть интеграции");
    expect(html).not.toContain("Создать клиентского бота");
  });

  it("shows one onboarding question at a time", () => {
    const serviceHtml = renderToStaticMarkup(<ServiceSetupForm action={async () => undefined} />);
    const paymentHtml = renderToStaticMarkup(<PaymentSetupForm action={async () => undefined} />);

    expect(serviceHtml).toContain("Добавьте первую услугу");
    expect(serviceHtml).toContain("Длительность");
    expect(serviceHtml).toContain("Стоимость");
    expect(serviceHtml).not.toContain("Карта DushanbeCity");
    expect(paymentHtml).toContain("Карта DushanbeCity");
    expect(paymentHtml).toContain("напрямую вашему бизнесу");
    expect(paymentHtml).not.toContain("Длительность");
  });

  it("marks the current wizard step accessibly", () => {
    const html = renderToStaticMarkup(<OnboardingProgress currentStep={2} />);

    expect(html).toContain("Услуга");
    expect(html).toContain("Оплата");
    expect(html).toContain("Запуск");
    expect(html).toContain('aria-current="step"');
  });

  it("renders a named submit action", () => {
    const html = renderToStaticMarkup(<OnboardingSubmitButton label="Сохранить услугу" pendingLabel="Сохраняем услугу" />);
    expect(html).toContain("Сохранить услугу");
    expect(html).toContain('type="submit"');
  });
});
