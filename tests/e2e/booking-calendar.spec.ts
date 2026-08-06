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

  // Left as the day was found, so the spec can run twice against the same seeded data.
  await page.getByRole("link", { name: new RegExp(`10:00.*${customerName}`, "s") }).click();
  await cancelBooking(page);
});

test("owner drags a visit to a later time in the day calendar", async ({ page }) => {
  const customerName = `Перенос ${Date.now().toString().slice(-6)}`;
  await signIn(page);

  await page.goto(`/dashboard/bookings?view=day&date=${DATE}`);
  await page.getByRole("link", { name: "Записать на 14:00, Алишер" }).click();
  await page.getByLabel("Услуга").selectOption({ label: "Мужская стрижка" });
  await page.getByLabel("Имя клиента").fill(customerName);
  await page.getByLabel("Телефон клиента").fill(`+99291${Date.now().toString().slice(-7)}`);
  await page.getByRole("button", { name: "Создать запись" }).click();
  await expect(page.getByRole("heading", { name: customerName })).toBeVisible();

  await page.goto(`/dashboard/bookings?view=day&date=${DATE}`);
  const block = page.getByRole("link", { name: new RegExp(`14:00.*${customerName}`, "s") });
  // The grid is taller than the viewport: mouse coordinates outside it deliver no events at all.
  await block.scrollIntoViewIfNeeded();
  const box = await block.boundingBox();
  if (!box) throw new Error("booking block has no box to drag");

  // 90 minutes at the grid's scale of 1.2 pixels a minute. Moved in steps, because a single jump gives the
  // browser no pointermove to report and the gesture would read as a click.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 54, { steps: 5 });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 108, { steps: 5 });
  await page.mouse.up();

  await expect(page.getByRole("link", { name: new RegExp(`15:30.*${customerName}`, "s") })).toBeVisible();
  // The vacated hour is offered again, which is what proves the server was told and not just the picture.
  await expect(page.getByRole("link", { name: "Записать на 14:00, Алишер" })).toBeVisible();
  // Releasing the mouse must not have opened the card the receptionist just moved.
  await expect(page).toHaveURL(/view=day/);

  await page.getByRole("link", { name: new RegExp(`15:30.*${customerName}`, "s") }).click();
  await cancelBooking(page);
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

test("owner drags a visit to another day in the week", async ({ page }) => {
  const customerName = `Неделя ${Date.now().toString().slice(-6)}`;
  await signIn(page);

  await page.goto(`/dashboard/bookings?view=day&date=${DATE}`);
  await page.getByRole("link", { name: "Записать на 11:00, Алишер" }).click();
  await page.getByLabel("Услуга").selectOption({ label: "Мужская стрижка" });
  await page.getByLabel("Имя клиента").fill(customerName);
  await page.getByLabel("Телефон клиента").fill(`+99293${Date.now().toString().slice(-7)}`);
  await page.getByRole("button", { name: "Создать запись" }).click();
  await expect(page.getByRole("heading", { name: customerName })).toBeVisible();

  await page.goto(`/dashboard/bookings?view=week&date=${DATE}`);
  const block = page.getByRole("link", { name: new RegExp(`11:00.*${customerName}`, "s") });
  await block.scrollIntoViewIfNeeded();
  const box = (await block.boundingBox())!;
  const thursday = (await page.getByRole("link", { name: /чт.*17 сент/is }).boundingBox())!;

  // Sideways across two day columns, keeping the same height: only the date should change.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(thursday.x + thursday.width / 2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();

  // The visit belongs to Thursday as soon as it is dropped there — the grid does not wait for the server
  // before showing the answer the receptionist gave it.
  await expect(page.getByRole("link", { name: /чт.*17 сент.*записей: 1/is })).toBeVisible();
  await expect(page.getByRole("link", { name: /вт.*15 сент.*свободно/is })).toBeVisible();

  // And it is still Thursday's after a reload, which is what proves the server was told rather than only
  // the picture being redrawn.
  await page.reload();
  await expect(page.getByRole("link", { name: /чт.*17 сент.*записей: 1/is })).toBeVisible();

  await page.goto(`/dashboard/bookings?view=day&date=2026-09-17`);
  await expect(page.getByRole("link", { name: new RegExp(`11:00.*${customerName}`, "s") })).toBeVisible();

  await page.getByRole("link", { name: new RegExp(`11:00.*${customerName}`, "s") }).click();
  await cancelBooking(page);
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

/** Frees the slot again so the whole spec is safe to run twice against one seeded database. */
async function cancelBooking(page: import("@playwright/test").Page) {
  await page.getByLabel("Причина отмены").fill("Убираем за тестом");
  await page.getByRole("button", { name: "Отменить запись" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Отменить запись" }).click();
  await expect(page.getByText("Запись отменена", { exact: true }).first()).toBeVisible();
}

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
