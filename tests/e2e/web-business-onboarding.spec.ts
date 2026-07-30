import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("new owner stays on the website and reaches authenticated onboarding", async ({ page }) => {
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
  await expect(page.locator(".onboarding-progress").getByText("Готово")).toBeVisible();
  await page.getByRole("link", { name: "Назад к услуге" }).click();
  await expect(page.getByRole("heading", { name: "Проверьте первую услугу" })).toBeVisible();
  await expect(page.getByLabel("Название услуги")).toHaveValue("Мужская стрижка");
  await page.getByRole("button", { name: "Сохранить и перейти к оплате" }).click();

  await page.getByLabel("Карта DushanbeCity").fill("9762000128351953");
  await page.getByRole("button", { name: "Сохранить карту" }).click();
  await expect(page.getByRole("heading", { name: "Клиенты уже могут записываться" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Создать клиентского Telegram-бота" })).toHaveAttribute("href", "/dashboard/settings/integrations");
  await expect(page.getByRole("link", { name: "Ваша ссылка для записи" })).toHaveAttribute("href", /\/b\//);
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
