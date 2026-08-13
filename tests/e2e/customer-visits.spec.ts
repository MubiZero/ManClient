import { expect, test } from "@playwright/test";
import { Client } from "pg";

import { createCustomerSessionToken } from "@/core/customers/customer-session-token";

import { nextDate } from "./dates";
import { signIn } from "./sign-in";

/**
 * The customer's own half of the product: their number is the account, and the visits behind it are
 * theirs to see and to drop. The code that opens the door goes out by SMS, which no test environment
 * has, so the session cookie is signed here directly — the flow under test is what a signed-in
 * customer can then do, not the six digits that got them in (those are covered by the unit and
 * integration tests around the verification service).
 */
const BOOKED_ON = nextDate(3);

test("a signed-in customer sees their visit and cancels it themselves", async ({ page, context }) => {
  const customerName = `Клиент ${Date.now().toString().slice(-6)}`;
  const customerPhone = `+99290${Date.now().toString().slice(-7)}`;

  await signIn(page);
  await page.goto("/dashboard/bookings/new");
  await page.getByLabel("Услуга").selectOption({ label: "Мужская стрижка" });
  await page.getByLabel("Специалист").selectOption({ label: "Алишер" });
  await page.getByLabel("Дата").fill(BOOKED_ON);
  await page.getByRole("group", { name: "Свободное время" }).getByRole("button").first().click();
  await page.getByLabel("Имя клиента").fill(customerName);
  await page.getByLabel("Телефон клиента").fill(customerPhone);
  await page.getByRole("button", { name: "Создать запись" }).click();
  await expect(page.getByRole("heading", { name: customerName })).toBeVisible();
  const bookingId = new URL(page.url()).pathname.split("/").pop();
  if (!bookingId) throw new Error("Booking id missing from the dashboard URL");

  // A visitor with no session is asked for their number rather than shown an empty page.
  await page.goto("/my");
  await expect(page.getByRole("heading", { name: "Вход по номеру телефона" })).toBeVisible();

  await context.addCookies([
    {
      name: "manclient-customer",
      value: createCustomerSessionToken({ phone: customerPhone, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }),
      url: "http://127.0.0.1:3000",
    },
  ]);

  await page.goto("/my");
  const visit = page.getByRole("article").filter({ hasText: "Мужская стрижка" }).first();
  await expect(visit).toBeVisible();
  await visit.getByRole("button", { name: "Отменить", exact: true }).click();
  await visit.getByRole("button", { name: "Да, отменить" }).click();
  await expect(page.getByText("Отменена").first()).toBeVisible();

  const database = new Client({ connectionString: process.env.DATABASE_URL });
  await database.connect();
  try {
    const result = await database.query<{ status: string }>(`SELECT status FROM "Booking" WHERE id = $1`, [bookingId]);
    expect(result.rows[0]?.status).toBe("CANCELLED");
  } finally {
    await database.end();
  }
});
