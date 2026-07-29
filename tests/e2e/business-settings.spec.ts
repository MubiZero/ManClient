import { expect, test } from "@playwright/test";

const ownerPassword = requiredEnv("DEMO_OWNER_PASSWORD");

test("owner creates, edits, archives and restores a branch", async ({ page }) => {
  await signIn(page);
  await page.goto("/dashboard/settings/branches");

  await page.getByRole("link", { name: "Создать филиал" }).click();
  await page.getByLabel("Название филиала").fill("Сомони, 12");
  await page.getByLabel("Адрес").fill("проспект Сомони, 12");
  await page.getByLabel("Контактный телефон").fill("+992 90 111 22 33");
  await page.getByRole("button", { name: "Создать филиал" }).click();
  await expect(page.getByText("Филиал создан")).toBeVisible();

  const row = page.getByRole("article").filter({ hasText: "Сомони, 12" });
  await row.getByRole("link", { name: "Изменить" }).click();
  await page.getByLabel("Название филиала").fill("Сомони");
  await page.getByRole("button", { name: "Сохранить филиал" }).click();
  await expect(page.getByRole("article").filter({ hasText: "Сомони" })).toBeVisible();

  await page.getByRole("article").filter({ hasText: "Сомони" }).getByRole("link", { name: "Архивировать" }).click();
  await page.getByRole("button", { name: "Архивировать филиал" }).click();
  await expect(page.getByText("Филиал архивирован")).toBeVisible();
  await page.getByRole("article").filter({ hasText: "Сомони" }).getByRole("button", { name: "Восстановить" }).click();
  await expect(page.getByText("Филиал восстановлен")).toBeVisible();
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
  if (!value) throw new Error(`${name} is required for business settings E2E tests`);
  return value;
}
