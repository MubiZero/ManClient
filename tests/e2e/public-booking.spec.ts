import { expect, test } from "@playwright/test";

import { nextDate } from "./dates";
import { Client } from "pg";

test("visitor selects a service, specialist and receives a payment link", async ({
  page,
}) => {
  await reachTimeStep(page);
  await page.getByLabel("Дата записи").fill(nextDate());
  await page.locator("[data-slot]").first().click();
  await page.getByRole("button", { name: "Назад к выбору времени" }).click();
  await expect(
    page.getByRole("heading", { name: "Выберите время" }),
  ).toBeVisible();
  await page.locator("[data-slot]").first().click();
  await page.getByLabel("Имя").fill("Мухаммад");
  await page.getByLabel("Телефон").fill("+99290");
  await page.getByLabel("Имя").focus();
  await expect(page.getByLabel("Телефон")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.locator("#booking-phone-error")).toHaveText(
    "Введите номер полностью: +992 90 123 45 67.",
  );
  await page.getByLabel("Телефон").fill("+992900001122");
  await expect(page.getByLabel("Телефон")).toHaveValue("+992 90 000 11 22");
  await page.getByRole("button", { name: "Перейти к оплате" }).click();
  await expect(page).toHaveURL(/\/pay\//);
  await expect(
    page.getByRole("heading", { name: "Завершите оплату" }),
  ).toBeVisible();
  const paymentHref = await page
    .getByRole("link", { name: /Оплатить/ })
    .getAttribute("href");
  expect(paymentHref).toContain("http://pay.expresspay.tj/");
  if (!paymentHref) throw new Error("Payment link is missing");
  const paymentUrl = new URL(paymentHref);
  expect(paymentUrl.origin).toBe("http://pay.expresspay.tj");
  expect(paymentUrl.searchParams.get("A")).toBe("1111222233334444");
});

test("visitor sees slot time in the selected branch timezone", async ({
  page,
}) => {
  const database = new Client({ connectionString: process.env.DATABASE_URL });
  await database.connect();
  let branch: { id: string; timeZone: string } | undefined;

  try {
    const result = await database.query<{ id: string; timeZone: string }>(`
      SELECT branch.id, branch."timeZone"
      FROM "Branch" AS branch
      JOIN "Business" AS business ON business.id = branch."businessId"
      WHERE business.slug = 'demo-barber'
      ORDER BY branch."createdAt" ASC
      LIMIT 1
    `);
    branch = result.rows[0];
    if (!branch) throw new Error("Seeded demo branch is missing");
    await database.query('UPDATE "Branch" SET "timeZone" = $1 WHERE id = $2', [
      "Europe/Berlin",
      branch.id,
    ]);
    await page.route("**/api/availability?**", (route) =>
      route.fulfill({ json: { starts: [`${nextDate()}T07:00:00.000Z`] } }),
    );
    await reachTimeStep(page);
    await page.getByLabel("Дата записи").fill(nextDate());
    await expect(page.getByRole("button", { name: "09:00" })).toBeVisible();
  } finally {
    if (branch) {
      await database.query(
        'UPDATE "Branch" SET "timeZone" = $1 WHERE id = $2',
        [branch.timeZone, branch.id],
      );
    }
    await database.end();
  }
});

test("visitor keeps slots from the most recent availability request", async ({
  page,
}) => {
  let requestCount = 0;
  const firstDate = nextDate();
  const secondDate = nextDate(3);
  await page.route("**/api/availability?**", async (route) => {
    requestCount += 1;
    const isFirstRequest = requestCount === 1;
    if (isFirstRequest)
      await new Promise((resolve) => setTimeout(resolve, 600));
    try {
      await route.fulfill({
        json: {
          starts: [
            `${isFirstRequest ? firstDate : secondDate}T${isFirstRequest ? "07" : "10"}:00:00.000Z`,
          ],
        },
      });
    } catch (error) {
      if (!isFirstRequest) throw error;
    }
  });

  await reachTimeStep(page);
  await page.getByLabel("Дата записи").fill(firstDate);
  await page.getByLabel("Дата записи").fill(secondDate);
  await expect(page.getByRole("button", { name: "15:00" })).toBeVisible();
  await page.waitForTimeout(700);
  await expect(page.getByRole("button", { name: "12:00" })).not.toBeVisible();
});

test("visitor sees a suspended-business message instead of the booking form", async ({ page }) => {
  const database = new Client({ connectionString: process.env.DATABASE_URL });
  await database.connect();
  try {
    await database.query(`UPDATE "Business" SET status = 'SUSPENDED' WHERE slug = 'demo-barber'`);
    await page.goto("/b/demo-barber");
    await expect(page.getByText("Запись временно недоступна")).toBeVisible();
    await expect(
      page.getByText("Онлайн-запись для этого бизнеса приостановлена. Свяжитесь с бизнесом напрямую, чтобы записаться."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Мужская стрижка/ })).not.toBeVisible();
  } finally {
    await database.query(`UPDATE "Business" SET status = 'ACTIVE' WHERE slug = 'demo-barber'`);
    await database.end();
  }
});

async function reachTimeStep(page: import("@playwright/test").Page) {
  await page.goto("/b/demo-barber");
  const branchButton = page.getByRole("button", { name: "Душанбе, центр" });
  if (await branchButton.isVisible().catch(() => false)) await branchButton.click();
  await page.getByRole("button", { name: /Мужская стрижка/ }).click();
  await page.getByRole("button", { name: /Алишер/ }).click();
}

