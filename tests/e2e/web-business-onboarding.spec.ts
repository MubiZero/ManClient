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
  const progress = page.getByRole("list", { name: "Этапы настройки бизнеса" });
  const firstStepMarker = await progress.locator("li").first().locator("span").boundingBox();
  const firstStepLabel = await progress.locator("li").first().locator("strong").boundingBox();
  expect(firstStepMarker).not.toBeNull();
  expect(firstStepLabel).not.toBeNull();
  expect(firstStepLabel!.y).toBeGreaterThanOrEqual(firstStepMarker!.y + firstStepMarker!.height);
  await page.getByLabel("Название услуги").fill("Мужская стрижка");
  await page.getByLabel("Стоимость, сомони").fill("50");
  await page.getByRole("button", { name: "Сохранить услугу" }).click();

  await expect(page.getByRole("heading", { name: "Как принимаете оплату" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Как принимаете оплату" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(progress.getByText("Услуга")).toBeVisible();
  await expect(progress.getByText("Оплата")).toBeVisible();
  await expect(progress.getByText("Запуск")).toBeVisible();
  // A step already behind the owner stays reachable: the wizard is the only place the first service
  // can be corrected before the booking link goes out.
  await expect(progress.getByRole("link", { name: "Услуга" })).toHaveAttribute("href", "/dashboard/onboarding?step=service");
  await page.getByRole("link", { name: "Назад к услуге" }).click();
  await expect(page).toHaveURL(/step=service/);
  await expect(page.getByRole("heading", { name: "Проверьте первую услугу" })).toBeVisible();
  await expect(page.getByLabel("Название услуги")).toHaveValue("Мужская стрижка");
  await page.getByRole("button", { name: "Сохранить и перейти к оплате" }).click();

  await page.getByLabel("Карта DushanbeCity").fill("9762000000000000");
  await page.getByRole("button", { name: "Сохранить карту" }).click();
  await expect(page.getByRole("heading", { name: "Страница записи работает" })).toBeVisible();
  await expect(progress.getByText("Запуск")).toBeVisible();
  await expect(page.getByText("Ссылка для клиентов")).toBeVisible();
  await expect(page.getByText("Отправьте её клиентам или разместите в Instagram, Telegram и на сайте.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Создать клиентского бота" })).toHaveAttribute("href", "/dashboard/settings/integrations");
  const bookingLink = page.getByRole("link", { name: "Открыть страницу" });
  await expect(bookingLink).toHaveAttribute("href", /\/b\//);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:3000" });
  await page.getByRole("button", { name: "Скопировать ссылку" }).click();
  await expect(page.getByText("Ссылка скопирована")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const openBox = await page.getByRole("link", { name: "Открыть страницу" }).boundingBox();
  const copyBox = await page.getByRole("button", { name: "Скопировать ссылку" }).boundingBox();
  expect(openBox).not.toBeNull();
  expect(copyBox).not.toBeNull();
  expect(openBox!.x).toBeGreaterThanOrEqual(0);
  expect(openBox!.x + openBox!.width).toBeLessThanOrEqual(390);
  expect(copyBox!.x + copyBox!.width).toBeLessThanOrEqual(390);
  await expect(page.getByRole("link", { name: "Открыть страницу" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Скопировать ссылку" })).toBeVisible();

  await bookingLink.click();
  await expect(page).toHaveURL(/\/b\//);
  await expect(page.getByText(`Салон ${suffix}`, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Запишитесь на удобное время" })).toBeVisible();
});

test("a salon that takes payment on the premises finishes onboarding without a card", async ({ page }) => {
  const suffix = randomUUID();
  const phoneSuffix = suffix.replace(/\D/g, "").padEnd(7, "2").slice(0, 7);
  await page.goto("/register");
  await page.getByLabel("Ваше имя").fill("Зафар Рахимов");
  await page.getByLabel("Номер телефона").fill(`91${phoneSuffix}`);
  await page.getByLabel("Пароль").fill("12345678");
  await page.getByLabel("Название бизнеса").fill(`Барбершоп ${suffix}`);
  await page.getByRole("button", { name: "Создать бизнес" }).click();

  await expect(page).toHaveURL(/\/dashboard\/onboarding$/);
  await page.getByLabel("Название услуги").fill("Стрижка бороды");
  await page.getByLabel("Стоимость, сомони").fill("40");
  await page.getByRole("button", { name: "Сохранить услугу" }).click();

  await expect(page.getByRole("heading", { name: "Как принимаете оплату" })).toBeVisible();
  await page.getByRole("button", { name: "Пропустить этот шаг" }).click();

  await expect(page.getByRole("heading", { name: "Страница записи работает" })).toBeVisible();
  // The decision sticks: a reload must not drop the owner back onto the step they just answered.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Страница записи работает" })).toBeVisible();

  // And the card is still reachable for the day this salon turns on a deposit.
  await page.goto("/dashboard/settings/branches");
  await expect(page.getByText("Не задана")).toBeVisible();
});

test("registration form fits a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Создайте кабинет бизнеса" })).toBeVisible();
  const box = await page.locator("form").boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});
