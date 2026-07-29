import { expect, test } from "@playwright/test";

test("visitor selects a service, specialist and receives a payment link", async ({ page }) => {
  await page.goto("/b/demo-barber");
  await page.getByRole("button", { name: /Мужская стрижка/ }).click();
  await page.getByRole("button", { name: /Алишер/ }).click();
  await page.getByLabel("Дата записи").fill(nextDate());
  await page.locator("[data-slot]").first().click();
  await page.getByLabel("Имя").fill("Мухаммад");
  await page.getByLabel("Телефон").fill("+992900001122");
  await page.getByRole("button", { name: "Перейти к оплате" }).click();
  await expect(page).toHaveURL(/\/pay\//);
  await expect(page.getByRole("heading", { name: "Завершите оплату" })).toBeVisible();
  const paymentHref = await page.getByRole("link", { name: /Оплатить/ }).getAttribute("href");
  expect(paymentHref).toContain("http://pay.expresspay.tj/");
  if (!paymentHref) throw new Error("Payment link is missing");
  const paymentUrl = new URL(paymentHref);
  expect(paymentUrl.origin).toBe("http://pay.expresspay.tj");
  expect(paymentUrl.searchParams.get("A")).toBe("1111222233334444");
});

function nextDate(): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + 2);
  return value.toISOString().slice(0, 10);
}
