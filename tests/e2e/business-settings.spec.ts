import { expect, test } from "@playwright/test";

const ownerPassword = requiredEnv("DEMO_OWNER_PASSWORD");

test("owner creates, edits, archives and restores a branch", async ({ page }) => {
  const suffix = Date.now().toString().slice(-6);
  const initialName = `Сомони, ${suffix}`;
  const updatedName = `Сомони ${suffix}`;
  await signIn(page);
  await page.goto("/dashboard/settings/branches");

  await page.getByRole("link", { name: "Создать филиал" }).click();
  await page.getByLabel("Название филиала").fill(initialName);
  await page.getByLabel("Адрес").fill("проспект Сомони, 12");
  await page.getByLabel("Контактный телефон").fill("+992 90 111 22 33");
  await page.getByRole("button", { name: "Создать филиал" }).click();
  await expect(page.getByText("Филиал создан")).toBeVisible();

  const row = page.getByRole("article").filter({ hasText: initialName });
  await row.getByRole("link", { name: "Изменить" }).click();
  await page.getByLabel("Название филиала").fill(updatedName);
  await page.getByRole("button", { name: "Сохранить филиал" }).click();
  await expect(page.getByRole("article").filter({ hasText: updatedName })).toBeVisible();

  await page.getByRole("article").filter({ hasText: updatedName }).getByRole("link", { name: "Архивировать" }).click();
  await page.getByRole("button", { name: "Архивировать филиал" }).click();
  await expect(page.getByText("Филиал архивирован")).toBeVisible();
  await page.getByRole("article").filter({ hasText: updatedName }).getByRole("button", { name: "Восстановить" }).click();
  await expect(page.getByText("Филиал восстановлен")).toBeVisible();
});

test("owner configures a specialist, resource and published service", async ({ page }) => {
  const suffix = Date.now().toString().slice(-6);
  const specialistName = `Фирдавс ${suffix}`;
  const resourceName = `Кресло ${suffix}`;
  const serviceName = `Укладка ${suffix}`;
  await signIn(page);

  await page.goto("/dashboard/settings/staff?action=new");
  await page.getByLabel("Имя специалиста").fill(specialistName);
  await expect(page.getByRole("group", { name: "Филиалы" }).getByRole("checkbox").first()).toBeChecked();
  await page.getByRole("button", { name: "Создать специалиста" }).click();
  await expect(page.getByText("Специалист создан")).toBeVisible();

  await page.goto("/dashboard/settings/resources?action=new");
  await page.getByLabel("Название ресурса").fill(resourceName);
  await page.getByLabel("Тип ресурса").selectOption("WORKSTATION");
  await page.getByRole("button", { name: "Создать ресурс" }).click();
  await expect(page.getByText("Ресурс создан")).toBeVisible();

  await page.goto("/dashboard/settings/services?action=new");
  await page.getByLabel("Название услуги").fill(serviceName);
  await page.getByLabel("Длительность, минут").fill("30");
  await page.getByLabel("Стоимость, сомони").fill("80");
  await page.getByRole("group", { name: "Специалисты" }).getByLabel(specialistName).check();
  await page.getByRole("group", { name: "Ресурсы" }).getByLabel(resourceName).check();
  await page.getByLabel("Опубликовать для клиентов").check();
  await page.getByRole("button", { name: "Создать услугу" }).click();
  await expect(page.getByText("Услуга создана")).toBeVisible();
  await expect(page.getByRole("article").filter({ hasText: serviceName })).toContainText("Опубликована");
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
