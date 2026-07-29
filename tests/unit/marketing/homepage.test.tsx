import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  MarketingHomePage,
  normalizeTelegramOnboardingUrl,
} from "@/features/marketing/homepage";

describe("ManClient homepage", () => {
  test("explains the B2B product and links owners to login", () => {
    const html = renderToStaticMarkup(
      <MarketingHomePage onboardingUrl="https://t.me/manclient_bot" />,
    );

    expect(html).toContain("Принимайте записи, пока занимаетесь бизнесом");
    expect(html).toContain('href="/login"');
    expect(html).toContain("Деньги поступают напрямую вашему бизнесу");
    expect(html).not.toContain("Запись подтверждена");
  });

  test("renders Telegram onboarding only for a safe configured URL", () => {
    expect(normalizeTelegramOnboardingUrl("https://t.me/manclient_bot")).toBe(
      "https://t.me/manclient_bot",
    );
    expect(normalizeTelegramOnboardingUrl("https://telegram.me/manclient_bot")).toBe(
      "https://telegram.me/manclient_bot",
    );
    expect(normalizeTelegramOnboardingUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeTelegramOnboardingUrl("https://example.com/manclient_bot")).toBeNull();

    const fallback = renderToStaticMarkup(<MarketingHomePage onboardingUrl={null} />);
    expect(fallback).toContain("Подключаем первые бизнесы вручную");
    expect(fallback).not.toContain("javascript:");
  });
});
