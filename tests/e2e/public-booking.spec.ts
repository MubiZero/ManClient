import { expect, test } from "@playwright/test";

test("visitor selects a service, specialist and receives a payment link", async ({ page }) => {
  let paymentHref = "";
  await page.route("http://pay.expresspay.tj/**", route => {
    paymentHref = route.request().url();
    return route.abort();
  });
  await page.goto("/b/demo-barber");
  await page.getByRole("button", { name: /Мужская стрижка/ }).click();
  await page.getByRole("button", { name: /Алишер/ }).click();
  await page.getByLabel("Дата записи").fill(nextDate());
  await page.locator("[data-slot]").first().click();
  await page.getByLabel("Имя").fill("Мухаммад");
  await page.getByLabel("Телефон").fill("+992900001122");
  await page.getByRole("button", { name: "Перейти к оплате" }).click();
  await expect.poll(() => paymentHref).toContain("http://pay.expresspay.tj/");
  const paymentUrl = new URL(paymentHref);
  expect(paymentUrl.origin).toBe("http://pay.expresspay.tj");
  expect(paymentUrl.searchParams.get("A")).toBe("1111222233334444");
});

function nextDate(): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + 2);
  return value.toISOString().slice(0, 10);
}
