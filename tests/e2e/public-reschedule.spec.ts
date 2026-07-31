import { expect, test } from "@playwright/test";
import { Client } from "pg";

import { createCustomerBookingToken } from "@/core/bookings/booking-action-token";

const ownerPassword = requiredEnv("DEMO_OWNER_PASSWORD");

test("visitor reschedules a booking from the public link", async ({ page }) => {
  const customerName = `Клиент ${Date.now().toString().slice(-6)}`;
  const customerPhone = `+99290${Date.now().toString().slice(-7)}`;

  await signIn(page);
  await page.goto("/dashboard/bookings/new");
  await page.getByLabel("Услуга").selectOption({ label: "Мужская стрижка" });
  await page.getByLabel("Специалист").selectOption({ label: "Алишер" });
  await page.getByLabel("Дата").fill("2026-08-11");
  await page.getByRole("group", { name: "Свободное время" }).getByRole("button").first().click();
  await page.getByLabel("Имя клиента").fill(customerName);
  await page.getByLabel("Телефон клиента").fill(customerPhone);
  await page.getByRole("button", { name: "Создать запись" }).click();
  await expect(page.getByRole("heading", { name: customerName })).toBeVisible();

  const bookingId = new URL(page.url()).pathname.split("/").pop();
  if (!bookingId) throw new Error("Booking id missing from the dashboard URL");

  const token = createCustomerBookingToken({
    bookingId,
    action: "reschedule_booking",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  await page.goto(`/reschedule/${token}`);
  await expect(page.getByRole("heading", { name: "Выберите новое время" })).toBeVisible();
  const [availabilityResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/availability") && response.url().includes("date=2026-08-13")),
    page.getByLabel("Новая дата").fill("2026-08-13"),
  ]);
  const { starts } = (await availabilityResponse.json()) as { starts: string[] };
  if (!starts.length) throw new Error("No availability returned for 2026-08-13");
  await expect(page.locator("[data-slot]").first()).toBeVisible();
  await page.locator("[data-slot]").first().click();
  await expect(page.getByText("Запись перенесена. Новое время сохранено.", { exact: true })).toBeVisible();

  const database = new Client({ connectionString: process.env.DATABASE_URL });
  await database.connect();
  try {
    // `startsAt` is stored as a naive timestamp holding UTC clock values (Prisma's convention).
    // Casting to text and reading it back as a string avoids node-postgres reinterpreting those
    // naive components in the test runner's local timezone, which would shift the date.
    const result = await database.query<{ startsAt: string }>(
      `SELECT "startsAt"::text AS "startsAt" FROM "Booking" WHERE id = $1`,
      [bookingId],
    );
    expect(result.rows[0]?.startsAt.slice(0, 10)).toBe("2026-08-13");
  } finally {
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
  if (!value) throw new Error(`${name} is required for the public reschedule E2E test`);
  return value;
}
