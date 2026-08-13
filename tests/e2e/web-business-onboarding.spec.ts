import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("new owner stays on the website and reaches authenticated onboarding", async ({ page, context }) => {
  const suffix = randomUUID();
  const phoneSuffix = suffix.replace(/\D/g, "").padEnd(7, "1").slice(0, 7);
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
  await page.getByLabel("Номер телефона").fill(`90${phoneSuffix}`);
  await page.getByLabel("Пароль").fill("12345678");
  await page.getByLabel("Название бизнеса").fill(`Салон ${suffix}`);
  await page.getByRole("button", { name: "Создать бизнес" }).click();

  await expect(page).toHaveURL(/\/dashboard\/onboarding$/);
  await expect(page.getByRole("heading", { name: "Подготовьте бизнес к записи" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Добавьте первую услугу" })).toBeVisible();
  const firstStepMarker = await page.locator(".onboarding-progress li").first().locator("span").boundingBox();
  const firstStepLabel = await page.locator(".onboarding-progress li").first().locator("strong").boundingBox();
  expect(firstStepMarker).not.toBeNull();
  expect(firstStepLabel).not.toBeNull();
  expect(firstStepLabel!.y).toBeGreaterThanOrEqual(firstStepMarker!.y + firstStepMarker!.height);
  await page.getByLabel("Название услуги").fill("Мужская стрижка");
  await page.getByLabel("Стоимость, сомони").fill("50");
  await page.getByRole("button", { name: "Сохранить услугу" }).click();

  await expect(page.getByRole("heading", { name: "Куда принимать оплату" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Куда принимать оплату" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".onboarding-progress").getByText("Услуга")).toBeVisible();
  await expect(page.locator(".onboarding-progress").getByText("Оплата")).toBeVisible();
  await expect(page.locator(".onboarding-progress").getByText("Запуск")).toBeVisible();
  await page.getByRole("link", { name: "Назад к услуге" }).click();
  await expect(page.getByRole("heading", { name: "Проверьте первую услугу" })).toBeVisible();
  await expect(page.getByLabel("Название услуги")).toHaveValue("Мужская стрижка");
  await page.getByRole("button", { name: "Сохранить и перейти к оплате" }).click();

  await page.getByLabel("Карта DushanbeCity").fill("9762000000000000");
  await page.getByRole("button", { name: "Сохранить карту" }).click();
  await expect(page.getByRole("heading", { name: "Страница записи работает" })).toBeVisible();
  await expect(page.locator(".onboarding-progress").getByText("Запуск")).toBeVisible();
  await expect(page.getByText("Ссылка для клиентов")).toBeVisible();
  await expect(page.getByText("Отправьте её клиентам или разместите в Instagram, Telegram и на сайте.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Создать клиентского бота" })).toHaveAttribute("href", "/dashboard/settings/integrations");
  const bookingLink = page.getByRole("link", { name: "Открыть страницу" });
  await expect(bookingLink).toHaveAttribute("href", /\/b\//);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:3000" });
  await page.getByRole("button", { name: "Скопировать ссылку" }).click();
  await expect(page.getByText("Ссылка скопирована")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const actionBox = await page.locator(".onboarding-launch-actions").boundingBox();
  expect(actionBox).not.toBeNull();
  expect(actionBox!.x).toBeGreaterThanOrEqual(0);
  expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(390);
  await expect(page.getByRole("link", { name: "Открыть страницу" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Скопировать ссылку" })).toBeVisible();

  await bookingLink.click();
  await expect(page).toHaveURL(/\/b\//);
  await expect(page.getByText(`Салон ${suffix}`, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Запишитесь на удобное время" })).toBeVisible();
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
