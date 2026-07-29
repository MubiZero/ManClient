import { expect, test } from "@playwright/test";

const ownerPassword = requiredEnv("DEMO_OWNER_PASSWORD");

test("owner creates, finds, reschedules and cancels a booking", async ({ page }) => {
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
  await expect(page.getByText("Создана в кабинете")).toBeVisible();
  await expect(page.getByText("Не оплачено").first()).toBeVisible();

  await page.getByLabel("Новое время").fill("2026-08-11T11:00");
  await page.getByRole("button", { name: "Перенести запись" }).click();
  await expect(page.getByText("Запись перенесена")).toBeVisible();

  await page.getByLabel("Причина отмены").fill("Клиент попросил отменить");
  await page.getByRole("button", { name: "Отменить запись" }).click();
  await expect(page.getByRole("status")).toHaveText("Запись отменена");
  await expect(page.getByText("Клиент попросил отменить")).toBeVisible();

  await page.goto(`/dashboard/bookings?view=list&search=${encodeURIComponent(customerName)}`);
  await expect(page.getByRole("link", { name: new RegExp(customerName) })).toContainText("Отменена");
});

test("booking workspace has no horizontal overflow", async ({ page }) => {
  await signIn(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard/bookings?view=list");
    await expect(page.getByRole("heading", { name: "Записи" })).toBeVisible();
    const overflow = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, elements: [...document.querySelectorAll("body *")].flatMap((element) => { const rect = element.getBoundingClientRect(); return rect.right > document.documentElement.clientWidth + 1 ? [`${element.tagName}.${element.className}:${Math.round(rect.right)}`] : []; }).slice(0, 8) }));
    expect(overflow, `overflow at ${width}px`).toEqual({ document: width, elements: [] });
  }
});

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Телефон или электронная почта").fill("owner@demo-barber.local");
  await page.getByLabel("Пароль").fill(ownerPassword);
  await page.getByRole("button", { name: "Войти в кабинет" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

function requiredEnv(name: "DEMO_OWNER_PASSWORD") { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; }
