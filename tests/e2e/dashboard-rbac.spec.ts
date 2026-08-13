import { expect, test } from "@playwright/test";

import { signIn } from "./sign-in";

const ownerPassword = requiredEnv("DEMO_OWNER_PASSWORD");
const staffPassword = requiredEnv("DEMO_STAFF_PASSWORD");

test("owner can open business settings", async ({ page }) => {
  await signIn(page, { email: "owner@demo-barber.local", password: ownerPassword });
  await page.goto("/dashboard/settings/services");

  await expect(page.getByRole("heading", { name: "Услуги" })).toBeVisible();
  await expect(page.getByText("Мужская стрижка")).toBeVisible();
});

test("staff cannot open business settings", async ({ page }) => {
  await signIn(page, { email: "alisher@demo-barber.local", password: staffPassword });
  await page.goto("/dashboard/settings/services");

  await expect(page).toHaveURL(/\/dashboard\?notice=settings$/);
  await expect(page.getByText("Настройки доступны владельцу и администратору", { exact: true }).first()).toBeVisible();
});

test("owner can reach settings and sign out controls on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, { email: "owner@demo-barber.local", password: ownerPassword });

  await page.getByRole("button", { name: "Ещё" }).click();
  await expect(page.getByRole("link", { name: /Услуги/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Выйти из кабинета" })).toBeVisible();
  await page.getByRole("link", { name: /Услуги/ }).click();

  await expect(page).toHaveURL(/\/dashboard\/settings\/services$/);
  await expect(page.getByRole("heading", { name: "Услуги" })).toBeVisible();
});

test("the bottom bar carries the day's work and counts the receipts waiting", async ({ page }) => {
  await signIn(page, { email: "owner@demo-barber.local", password: ownerPassword });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");

  const bar = page.getByRole("navigation", { name: "Основные разделы" });
  await expect(bar.getByRole("link", { name: "Записи", exact: true })).toBeVisible();
  await expect(bar.getByRole("link", { name: /Чеки/ })).toBeVisible();
  await expect(bar.getByRole("link", { name: "Новая запись" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Ещё" })).toBeVisible();

  // The plus is the receptionist's most common action: a client on the phone, booked standing up.
  await bar.getByRole("link", { name: "Новая запись" }).click();
  await expect(page).toHaveURL(/\/dashboard\/bookings\/new/);
});

function requiredEnv(name: "DEMO_OWNER_PASSWORD" | "DEMO_STAFF_PASSWORD"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for dashboard E2E tests`);
  return value;
}
