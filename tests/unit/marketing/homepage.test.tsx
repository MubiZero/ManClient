import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { MarketingHomePage } from "@/features/marketing/homepage";
import { metadata } from "@/app/layout";

describe("ManClient homepage", () => {
  test("explains the B2B product and links owners to login", () => {
    const html = renderToStaticMarkup(
      <MarketingHomePage />,
    );

    expect(html).toContain("Принимайте записи, пока занимаетесь бизнесом");
    expect(html).toContain('href="/login"');
    expect(html).toContain('href="/register"');
    expect(html).not.toContain('href="https://t.me/');
    expect(html).toContain("Деньги поступают напрямую вашему бизнесу");
    expect(html).not.toContain("Запись подтверждена");
  });

  test("keeps business onboarding on the website", () => {
    const html = renderToStaticMarkup(<MarketingHomePage />);
    expect(html.match(/href="\/register"/g)).toHaveLength(3);
    expect(html).not.toContain("Подключаем первые бизнесы вручную");
  });

  test("provides semantic navigation and product metadata", () => {
    const html = renderToStaticMarkup(<MarketingHomePage />);

    expect(html).toContain('aria-label="Основная навигация"');
    expect(html).toContain('id="how-it-works"');
    expect(html).toContain("Освободите переписку от ручной записи");
    expect(html).not.toContain("<button");
    expect(metadata.title).toBe("ManClient - онлайн-запись для сервисного бизнеса");
    expect(metadata.description).toContain("Таджикистане");
  });
});
