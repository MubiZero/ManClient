import { expect, test } from "@playwright/test";

const ownerPassword = requiredEnv("DEMO_OWNER_PASSWORD");
/** A date no other spec touches, so the day starts empty and the free slots below are predictable. */
const DATE = "2026-09-15";

/**
 * The calendar is only useful if clicking an empty patch of it books that time. This walks the loop the
 * receptionist actually walks — read the day, click the gap, save the client — and then checks the gap is
 * gone from the picture, which is what proves the grid reflects the database rather than a guess.
 */
test("owner books a visit from a gap in the day calendar", async ({ page }) => {
  const customerName = `Клиент ${Date.now().toString().slice(-6)}`;
  const customerPhone = `+99290${Date.now().toString().slice(-7)}`;
  await signIn(page);

  await page.goto(`/dashboard/bookings?view=day&date=${DATE}`);
  const slot = page.getByRole("link", { name: "Записать на 10:00, Алишер" });
  await expect(slot).toBeVisible();
  await slot.click();

  await expect(page).toHaveURL(/\/dashboard\/bookings\/new/);
  await expect(page.getByLabel("Дата")).toHaveValue(DATE);
  await page.getByLabel("Услуга").selectOption({ label: "Мужская стрижка" });
  // Specialist and time came from the slot: the form only needed the service, and the sweep confirmed
  // 10:00 is still free, so the submit button is already enabled.
  await expect(page.getByLabel("Специалист")).toHaveValue(/.+/);
  await page.getByLabel("Имя клиента").fill(customerName);
  await page.getByLabel("Телефон клиента").fill(customerPhone);
  await page.getByRole("button", { name: "Создать запись" }).click();
  await expect(page.getByRole("heading", { name: customerName })).toBeVisible();

  await page.goto(`/dashboard/bookings?view=day&date=${DATE}`);
  await expect(page.getByRole("link", { name: new RegExp(`10:00.*${customerName}`, "s") })).toBeVisible();
  await expect(page.getByRole("link", { name: "Записать на 10:00, Алишер" })).toHaveCount(0);
});

test("the week shows every day and hands off to the day it is asked about", async ({ page }) => {
  await signIn(page);

  await page.goto(`/dashboard/bookings?view=week&date=${DATE}`);
  // 2026-09-15 is a Tuesday, so its week runs Monday the 14th to Sunday the 20th.
  await expect(page.getByRole("link", { name: /вт.*15 сент/is })).toBeVisible();
  await expect(page.getByRole("link", { name: /пн.*14 сент/is })).toBeVisible();
  await expect(page.getByRole("link", { name: /вс.*20 сент/is })).toBeVisible();
  // Demo-barber's branch has one specialist, so the week knows whose gaps these are and offers them.
  await expect(page.getByRole("link", { name: /Записать на 10:00, 2026-09-15/ })).toBeVisible();

  await page.getByRole("link", { name: /вт.*15 сент/is }).click();
  await expect(page).toHaveURL(/view=day&date=2026-09-15/);
  await expect(page.getByRole("link", { name: "Записать на 10:00, Алишер" })).toBeVisible();
});

test("the calendar scrolls inside itself instead of widening the page", async ({ page }) => {
  await signIn(page);
  for (const [width, view] of [[320, "day"], [390, "week"], [768, "day"], [1440, "week"]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/dashboard/bookings?view=${view}&date=${DATE}`);
    // Exact, because the day view also heads its list section with a name containing this stem.
    await expect(page.getByRole("heading", { name: "Записи", exact: true })).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, `page horizontal scroll at ${width}px in the ${view} view`).toBe(width);
  }
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
  if (!value) throw new Error(`${name} is required`);
  return value;
}
