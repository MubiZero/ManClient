import { expect, test } from "@playwright/test";

test("new owner stays on the website and reaches authenticated onboarding", async ({ page }) => {
  const suffix = Date.now().toString(36);
  await page.goto("/");
  const connect = page.getByRole("link", { name: "Подключить бизнес" }).first();
  await expect(connect).toHaveAttribute("href", "/register");
  await connect.click();
  await expect(page).toHaveURL(/\/register$/);
  const passwordBox = await page.getByLabel("Пароль").boundingBox();
  const businessBox = await page.getByLabel("Название бизнеса").boundingBox();
  expect(passwordBox).not.toBeNull();
  expect(businessBox).not.toBeNull();
  expect(Math.abs(passwordBox!.y - businessBox!.y)).toBeLessThanOrEqual(1);

  await page.getByLabel("Ваше имя").fill("Мухаммад Саидов");
  await page.getByLabel("Номер телефона").fill(`90${suffix.replace(/\D/g, "").padEnd(7, "1").slice(0, 7)}`);
  await page.getByLabel("Пароль").fill("safe-password-123");
  await page.getByLabel("Название бизнеса").fill(`Салон ${suffix}`);
  await page.getByRole("button", { name: "Создать бизнес" }).click();

  await expect(page).toHaveURL(/\/dashboard\/onboarding$/);
  await expect(page.getByRole("heading", { name: "Подготовьте бизнес к записи" })).toBeVisible();
  await page.getByLabel("Первая услуга").fill("Мужская стрижка");
  await page.getByLabel("Стоимость, сомони").fill("50");
  await page.getByLabel("Карта DushanbeCity").fill("9762000128351953");
  await page.getByRole("button", { name: "Сохранить и продолжить" }).click();
  await expect(page.getByText("Бизнес готов к первым записям")).toBeVisible();
  await expect(page.getByRole("link", { name: "Настроить Telegram" })).toHaveAttribute("href", "/dashboard/settings/integrations");
});

test("registration form fits a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Создайте кабинет бизнеса" })).toBeVisible();
  const panel = page.locator(".registration-panel");
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});
