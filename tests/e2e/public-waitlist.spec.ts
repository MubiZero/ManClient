import { expect, test } from "@playwright/test";
import { Client } from "pg";

/**
 * The waitlist existed end to end — model, service, job, dashboard, SMS — with no way for a customer to
 * join it: the public form was written but never rendered. This walks the path that was missing, from a
 * day with nothing free to a row in the queue.
 */
test("visitor joins the waitlist when a day has nothing free", async ({ page }) => {
  const phone = `+99290${String(Date.now()).slice(-7)}`;
  const database = new Client({ connectionString: process.env.DATABASE_URL });
  await database.connect();

  try {
    // The demo business is on the entry plan, where the waitlist is not part of the offer.
    await database.query(`UPDATE "Business" SET "subscriptionPlan" = 'PREMIUM' WHERE slug = 'demo-barber'`);
    // An empty day is asserted rather than hunted for: which days the seeded barber works is not what
    // this test is about.
    await page.route("**/api/availability?**", (route) => route.fulfill({ json: { starts: [] } }));

    await page.goto("/b/demo-barber");
    // The branch step only appears when the demo business has more than one branch, which depends on
    // whether the settings suite has run before this one.
    const branchButton = page.getByRole("button", { name: "Душанбе, центр" });
    if (await branchButton.isVisible().catch(() => false)) await branchButton.click();
    await page.getByRole("button", { name: /Мужская стрижка/ }).click();
    await page.getByRole("button", { name: /Алишер/ }).click();
    await page.getByLabel("Дата записи").fill(nextDate());

    await expect(page.getByText("На эту дату свободного времени нет")).toBeVisible();
    await page.getByRole("button", { name: "Встать в лист ожидания" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Удобно с")).toHaveValue(nextDate());
    await dialog.getByLabel("Имя").fill("Мухаммад");
    await dialog.getByLabel("Телефон").fill(phone);
    await dialog.getByRole("button", { name: "Записаться в лист" }).click();

    await expect(dialog.getByText("Вы в листе ожидания")).toBeVisible();

    const stored = await database.query<{ status: string }>(
      `SELECT entry.status FROM "WaitlistEntry" AS entry
       JOIN "Customer" AS customer ON customer.id = entry."customerId"
       WHERE customer.phone = $1`,
      [phone],
    );
    expect(stored.rows[0]?.status).toBe("WAITING");
  } finally {
    await database.query(`DELETE FROM "WaitlistEntry" WHERE "customerId" IN (SELECT id FROM "Customer" WHERE phone = $1)`, [phone]);
    await database.query(`DELETE FROM "Customer" WHERE phone = $1`, [phone]);
    await database.query(`UPDATE "Business" SET "subscriptionPlan" = 'START' WHERE slug = 'demo-barber'`);
    await database.end();
  }
});

function nextDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 3);
  return date.toISOString().slice(0, 10);
}
