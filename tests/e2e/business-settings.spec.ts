import { expect, test } from "@playwright/test";

const ownerPassword = requiredEnv("DEMO_OWNER_PASSWORD");

test("owner creates, edits, archives and restores a branch", async ({ page }) => {
  const suffix = Date.now().toString().slice(-6);
  const initialName = `Сомони, ${suffix}`;
  const updatedName = `Сомони ${suffix}`;
  await signIn(page);
  await page.goto("/dashboard/settings/branches");

  await page.getByRole("link", { name: "Создать филиал" }).click();
  await page.getByLabel("Название филиала").fill(initialName);
  await page.getByLabel("Адрес").fill("проспект Сомони, 12");
  await page.getByLabel("Контактный телефон").fill("+992 90 111 22 33");
  await page.getByRole("button", { name: "Создать филиал" }).click();
  await expect(page.getByText("Филиал создан")).toBeVisible();

  const row = page.getByRole("article").filter({ hasText: initialName });
  await row.getByRole("link", { name: "Изменить" }).click();
  await page.getByLabel("Название филиала").fill(updatedName);
  await page.getByRole("button", { name: "Сохранить филиал" }).click();
  await expect(page.getByRole("article").filter({ hasText: updatedName })).toBeVisible();

  await page.getByRole("article").filter({ hasText: updatedName }).getByRole("link", { name: "Архивировать" }).click();
  await page.getByRole("button", { name: "Архивировать филиал" }).click();
  await expect(page.getByText("Филиал архивирован")).toBeVisible();
  await page.getByRole("article").filter({ hasText: updatedName }).getByRole("button", { name: "Восстановить" }).click();
  await expect(page.getByText("Филиал восстановлен")).toBeVisible();
});

test("owner configures a specialist, resource and published service", async ({ page }) => {
  const suffix = Date.now().toString().slice(-6);
  const specialistName = `Фирдавс ${suffix}`;
  const resourceName = `Кресло ${suffix}`;
  const serviceName = `Укладка ${suffix}`;
  await signIn(page);

  await page.goto("/dashboard/settings/staff?action=new");
  await page.getByLabel("Имя специалиста").fill(specialistName);
  await expect(page.getByRole("group", { name: "Филиалы" }).getByRole("checkbox").first()).toBeChecked();
  await page.getByRole("button", { name: "Создать специалиста" }).click();
  await expect(page.getByText("Специалист создан")).toBeVisible();

  await page.goto("/dashboard/settings/resources?action=new");
  await page.getByLabel("Название ресурса").fill(resourceName);
  await page.getByLabel("Тип ресурса").selectOption("WORKSTATION");
  await page.getByRole("button", { name: "Создать ресурс" }).click();
  await expect(page.getByText("Ресурс создан")).toBeVisible();

  await page.goto("/dashboard/settings/services?action=new");
  await page.getByLabel("Название услуги").fill(serviceName);
  await page.getByLabel("Длительность, минут").fill("30");
  await page.getByLabel("Стоимость, сомони").fill("80");
  await page.getByRole("group", { name: "Специалисты" }).getByLabel(specialistName).check();
  await page.getByRole("group", { name: "Ресурсы" }).getByLabel(resourceName).check();
  await page.getByLabel("Опубликовать для клиентов").check();
  await page.getByRole("button", { name: "Создать услугу" }).click();
  await expect(page.getByText("Услуга создана")).toBeVisible();
  await expect(page.getByRole("article").filter({ hasText: serviceName })).toContainText("Опубликована");
});

test("owner configures schedule, lunch break and a day off", async ({ page }) => {
  await signIn(page);
  await page.goto("/dashboard/settings/schedule");

  const monday = page.getByRole("group", { name: "Понедельник" });
  await monday.getByLabel("Начало").fill("09:00");
  await monday.getByLabel("Конец").fill("18:00");
  await monday.getByLabel("Перерыв").check();
  await monday.getByLabel("С").fill("12:00");
  await monday.getByLabel("До").fill("13:00");
  await page.getByRole("button", { name: "Скопировать на будни" }).click();
  await page.getByRole("button", { name: "Сохранить расписание" }).click();
  await expect(page.getByText("Расписание сохранено")).toBeVisible();

  await page.getByLabel("Дата").fill("2026-08-10");
  await page.getByLabel("Комментарий").fill("Праздник");
  await page.getByRole("button", { name: "Добавить изменение" }).click();
  await expect(page.getByText("Изменение даты добавлено")).toBeVisible();
  await expect(page.getByText("Выходной · Праздник", { exact: true }).first()).toBeVisible();

  await page.goto("/b/demo-barber");
  await page.getByRole("button", { name: /Мужская стрижка/ }).click();
  await page.getByRole("button", { name: /Алишер/ }).click();
  await page.getByLabel("Дата записи").fill("2026-08-10");
  await expect(page.getByText("На эту дату свободного времени нет")).toBeVisible();
});

test("settings remain usable without horizontal overflow at supported widths", async ({ page }) => {
  await signIn(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard/settings/schedule");
    await expect(page.getByRole("heading", { name: "Расписание" })).toBeVisible();
    const overflow = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      elements: [...document.querySelectorAll("body *")].flatMap((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right > document.documentElement.clientWidth + 1 ? [`${element.tagName.toLowerCase()}.${element.className}: ${Math.round(rect.right)}`] : [];
      }).slice(0, 8),
    }));
    expect(overflow, `overflow at ${width}px`).toEqual({ viewport: width, document: width, elements: [] });
    if (width < 768) {
      await page.getByRole("button", { name: "Ещё" }).click();
      await expect(page.getByRole("link", { name: "Интеграции" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Выйти" })).toBeVisible();
    }
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
  if (!value) throw new Error(`${name} is required for business settings E2E tests`);
  return value;
}
