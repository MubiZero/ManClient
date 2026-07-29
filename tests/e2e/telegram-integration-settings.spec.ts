import { expect, test } from "@playwright/test";

const ownerPassword = requiredEnv("DEMO_OWNER_PASSWORD");

test("owner can choose the secondary existing-bot path without retaining its token", async ({ page }) => {
  await page.route("**/api/integrations/telegram", async route => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postDataJSON() as { token: string };
    expect(body.token).toBe("123456:temporary-token");
    await route.fulfill({
      json: { status: "ACTIVE", botUsername: "salon_customer_bot", connectedAt: new Date().toISOString(), lastWebhookError: null },
    });
  });

  await signIn(page);
  await page.goto("/dashboard/settings/integrations");
  await expect(page.getByRole("heading", { name: "Telegram" })).toBeVisible();
  await expect(page.getByText("Создайте только одного бота")).toBeVisible();
  await page.getByRole("button", { name: "Подключить существующего бота" }).click();

  const token = page.getByLabel("Токен клиентского бота");
  await expect(token).toHaveAttribute("autocomplete", "off");
  await token.fill("123456:temporary-token");
  await page.getByRole("button", { name: "Подключить бота" }).click();

  await expect(page.getByText("@salon_customer_bot")).toBeVisible();
  await expect(token).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Токен клиентского бота")).toHaveCount(0);
});

test("settings remain usable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto("/dashboard/settings/integrations");
  await expect(page.getByRole("heading", { name: "Telegram" })).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Телефон или электронная почта").fill("owner@demo-barber.local");
  await page.getByLabel("Пароль").fill(ownerPassword);
  await page.getByRole("button", { name: "Войти в кабинет" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

function requiredEnv(name: "DEMO_OWNER_PASSWORD") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for dashboard E2E tests`);
  return value;
}
