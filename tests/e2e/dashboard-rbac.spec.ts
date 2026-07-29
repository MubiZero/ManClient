import { expect, test } from "@playwright/test";

const ownerPassword = requiredEnv("DEMO_OWNER_PASSWORD");
const staffPassword = requiredEnv("DEMO_STAFF_PASSWORD");

test("owner can open business settings", async ({ page }) => {
  await signIn(page, "owner@demo-barber.local", ownerPassword);
  await page.goto("/dashboard/settings/services");

  await expect(page.getByRole("heading", { name: "Услуги" })).toBeVisible();
  await expect(page.getByText("Мужская стрижка")).toBeVisible();
});

test("staff cannot open business settings", async ({ page }) => {
  await signIn(page, "alisher@demo-barber.local", staffPassword);
  await page.goto("/dashboard/settings/services");

  await expect(page).toHaveURL(/\/dashboard\?notice=settings$/);
  await expect(page.getByText("Настройки доступны владельцу и администратору")).toBeVisible();
});

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Телефон или электронная почта").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти в кабинет" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

function requiredEnv(name: "DEMO_OWNER_PASSWORD" | "DEMO_STAFF_PASSWORD"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for dashboard E2E tests`);
  return value;
}
