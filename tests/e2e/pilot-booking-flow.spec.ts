import { expect, test } from "@playwright/test";

const autoOwnerPassword = requiredEnv("DEMO_AUTO_OWNER_PASSWORD");
const internalSecret = requiredEnv("INTERNAL_API_SECRET");

test("pilot auto service confirms a resource booking after receipt", async ({ page, request }) => {
  const suffix = String(Date.now()).slice(-7);
  const customerName = `Сорбон ${suffix}`;
  let paymentUrl = "";
  let booking: { bookingId: string; paymentId: string } | undefined;
  await page.route("**/api/bookings", async route => {
    const response = await route.fetch();
    booking = await response.json() as { bookingId: string; paymentId: string };
    await route.fulfill({ response });
  });
  await page.route("http://pay.expresspay.tj/**", route => {
    paymentUrl = route.request().url();
    return route.abort();
  });
  await page.goto("/b/demo-auto");
  await page.getByRole("button", { name: /Замена масла/ }).click();
  await page.getByRole("button", { name: /Бехруз/ }).click();
  await page.getByLabel("Дата записи").fill(nextDate());
  await page.locator("[data-slot]").first().click();
  await page.getByLabel("Имя").fill(customerName);
  await page.getByLabel("Телефон").fill(`+99290${suffix}`);
  await page.getByRole("button", { name: "Перейти к оплате" }).click();
  await expect.poll(() => paymentUrl).toContain("http://pay.expresspay.tj/");
  if (!booking) throw new Error("Booking response was not captured");

  const receipt = await request.post(`/api/payments/${booking.paymentId}/receipt`, {
    headers: { "x-manclient-internal-secret": internalSecret },
    data: {
      receiptStorageKey: `receipts/e2e/${booking.bookingId}.png`,
      operationNumber: String(Date.now()),
      amountDiram: 12_000,
      recipientCardSuffix: "4444",
      operationAt: new Date().toISOString(),
      isSuccessful: true,
    },
  });
  expect(receipt.status()).toBe(200);

  await page.goto("/login");
  await page.getByLabel("Телефон или электронная почта").fill("owner@demo-auto.local");
  await page.getByLabel("Пароль").fill(autoOwnerPassword);
  await page.getByRole("button", { name: "Войти в кабинет" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/dashboard/bookings");
  const bookingRow = page.getByRole("article").filter({ hasText: customerName });
  await expect(bookingRow).toContainText("Подтверждена");
  await expect(bookingRow).toContainText("Подъёмник 1");
});

function nextDate(): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + 3);
  return value.toISOString().slice(0, 10);
}

function requiredEnv(name: "DEMO_AUTO_OWNER_PASSWORD" | "INTERNAL_API_SECRET") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for pilot E2E tests`);
  return value;
}
