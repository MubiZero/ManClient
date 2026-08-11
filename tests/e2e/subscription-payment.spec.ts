import { expect, test } from "@playwright/test";
import { Client } from "pg";

const ownerPassword = requiredEnv("DEMO_OWNER_PASSWORD");

/**
 * The path a business walks when its subscription runs out: it is told what is about to stop, it is
 * shown the price, it asks for a bill, and the bill has a number and a sum it can transfer against.
 * Paying the transfer itself is not here — that needs a real receipt and the OCR behind it, which
 * the integration tests cover with the recognizer injected.
 */
test("owner in grace sees the warning, prices a plan and gets a bill", async ({ page }) => {
  const database = new Client({ connectionString: process.env.DATABASE_URL });
  await database.connect();

  try {
    // The demo business is seeded paid-for-ever; this puts it a week past a period end.
    await database.query(`
      UPDATE "Business"
      SET "subscriptionStatus" = 'GRACE', "subscriptionEndsAt" = NOW() - INTERVAL '2 days'
      WHERE slug = 'demo-barber'
    `);
    await database.query(`DELETE FROM "SubscriptionInvoice" WHERE "businessId" = (SELECT id FROM "Business" WHERE slug = 'demo-barber')`);
    await database.query(`
      INSERT INTO "PlanPrice" (id, plan, period, "amountDiram", "updatedAt")
      VALUES ('e2e-price-premium-monthly', 'PREMIUM', 'MONTHLY', 30000, NOW())
      ON CONFLICT (plan, period) DO UPDATE SET "amountDiram" = 30000
    `);

    await signIn(page);
    // The warning follows the owner around the cabinet rather than waiting on the billing page.
    const banner = page.getByRole("alert").filter({ hasText: "Подписка не оплачена" });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("отключатся SMS-уведомления");

    await page.goto("/dashboard/settings/plan");
    await expect(page.getByText("Оплата просрочена").first()).toBeVisible();

    await page.getByLabel("Тариф").selectOption("PREMIUM");
    await page.getByLabel("Период").selectOption("MONTHLY");
    // The price is on screen before anything is confirmed.
    await expect(page.getByText(/300,00/).first()).toBeVisible();

    await page.getByRole("button", { name: "Выставить счёт" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Премиум");
    await dialog.getByRole("button", { name: /Выставить счёт на 300,00/ }).click();

    await expect(page.getByRole("heading", { name: "Счёт к оплате" })).toBeVisible();
    // The panel's own wording, so the same number in the history table below does not match too.
    await expect(page.getByText(/счёт SUB-/)).toBeVisible();
    await expect(page.getByRole("cell", { name: /^SUB-/ })).toBeVisible();
    await expect(page.getByLabel("Чек об оплате")).toBeVisible();

    const invoices = await database.query<{ status: string; amountDiram: number }>(
      `SELECT status, "amountDiram" FROM "SubscriptionInvoice" WHERE "businessId" = (SELECT id FROM "Business" WHERE slug = 'demo-barber')`,
    );
    expect(invoices.rows).toEqual([{ status: "OPEN", amountDiram: 30000 }]);
  } finally {
    // Left as the demo data was found, so the other specs keep working against a paid-up business.
    await database.query(`DELETE FROM "SubscriptionInvoice" WHERE "businessId" = (SELECT id FROM "Business" WHERE slug = 'demo-barber')`);
    await database.query(`DELETE FROM "PlanPrice" WHERE id = 'e2e-price-premium-monthly'`);
    await database.query(`
      UPDATE "Business"
      SET "subscriptionStatus" = 'ACTIVE', "subscriptionEndsAt" = NULL
      WHERE slug = 'demo-barber'
    `);
    await database.end();
  }
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
  if (!value) throw new Error(`${name} is required for the subscription payment E2E test`);
  return value;
}
