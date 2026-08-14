import { expect, test } from "@playwright/test";

import { signIn } from "./sign-in";

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
  await expect(page.getByRole("heading", { name: "Telegram", exact: true })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Telegram", exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});

