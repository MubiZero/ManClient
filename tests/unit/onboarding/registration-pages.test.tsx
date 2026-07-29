import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OnboardingChecklist } from "@/features/onboarding/onboarding-checklist";
import { BusinessSetupForm } from "@/features/onboarding/business-setup-form";
import { RegistrationForm } from "@/features/onboarding/registration-form";

describe("web business onboarding", () => {
  it("collects the tenant owner and business data with persistent labels", () => {
    const html = renderToStaticMarkup(<RegistrationForm action={async () => undefined} />);

    expect(html).toContain("Имя владельца");
    expect(html).toContain("Название бизнеса");
    expect(html).toContain("Основной филиал");
    expect(html).toContain('autoComplete="new-password"');
    expect(html).toContain("Минимум 12 символов");
    expect(html).toContain('href="/login"');
  });

  it("offers real next steps inside the dashboard", () => {
    const html = renderToStaticMarkup(<OnboardingChecklist />);

    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/dashboard/settings/integrations"');
    expect(html).not.toContain('href="https://t.me/');
  });

  it("collects a real first service and direct-payment card", () => {
    const html = renderToStaticMarkup(<BusinessSetupForm action={async () => undefined} />);
    expect(html).toContain("Первая услуга");
    expect(html).toContain("Длительность");
    expect(html).toContain("Стоимость");
    expect(html).toContain("Карта DushanbeCity");
    expect(html).toContain('inputMode="numeric"');
  });
});
