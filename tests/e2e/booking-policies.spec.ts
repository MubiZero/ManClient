import { expect, test } from "@playwright/test";

const ownerPassword = requiredEnv("DEMO_OWNER_PASSWORD");

/**
 * The rules are only worth anything if the customer sees the same ones the server enforces, so this
 * walks the whole path: the owner sets them in the dashboard, and the public page states them back.
 */
test("owner sets booking rules and the public page states them to customers", async ({ page }) => {
  await signIn(page);

  await page.goto("/dashboard/settings/policies");
  await page.getByLabel("Принимать записи не позднее чем").selectOption("120");
  await page.getByLabel("Горизонт записи, дней").fill("30");
  await page.getByLabel("Клиент может отменить или перенести").selectOption("24");
  await page.getByLabel("Лимит переносов одной записи").fill("2");
  await page.getByLabel("Что клиент оплачивает при записи").selectOption("DEPOSIT");
  await page.getByLabel("Депозит, % от стоимости").fill("20");
  await page.getByLabel("Текст правил для клиентов").fill("Опоздание больше 15 минут — визит переносится.");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Правила записи сохранены")).toBeVisible();

  // Reloading proves the numbers were persisted rather than only held in the form state.
  await page.reload();
  await expect(page.getByLabel("Горизонт записи, дней")).toHaveValue("30");
  await expect(page.getByLabel("Лимит переносов одной записи")).toHaveValue("2");
  await expect(page.getByLabel("Депозит, % от стоимости")).toHaveValue("20");

  await page.goto("/b/demo-barber");
  const policy = page.getByText("Правила записи", { exact: true }).locator("..");
  await expect(policy).toContainText("не позднее чем за 2 ч");
  await expect(policy).toContainText("до 30 дней");
  await expect(policy).toContainText("не позднее чем за 24 ч");
  await expect(policy).toContainText("не более 2 раз");
  await expect(policy).toContainText("Опоздание больше 15 минут");
  await expect(policy).toContainText("депозит — 20% стоимости");

  // Left as the demo data found them, so the other specs keep booking against an unrestricted business.
  await page.goto("/dashboard/settings/policies");
  await page.getByLabel("Принимать записи не позднее чем").selectOption("0");
  await page.getByLabel("Горизонт записи, дней").fill("");
  await page.getByLabel("Клиент может отменить или перенести").selectOption("0");
  await page.getByLabel("Лимит переносов одной записи").fill("");
  await page.getByLabel("Что клиент оплачивает при записи").selectOption("FULL");
  await page.getByLabel("Текст правил для клиентов").fill("");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Правила записи сохранены")).toBeVisible();
});

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Телефон или электронная почта").fill("owner@demo-barber.local");
  await page.getByLabel("Пароль").fill(ownerPassword);
  await page.getByRole("button", { name: "Войти в кабинет" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

function requiredEnv(name: "DEMO_OWNER_PASSWORD"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for booking policy E2E tests`);
  return value;
}
