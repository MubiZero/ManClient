import { expect, type Page } from "@playwright/test";

/**
 * Signing in, in one place because every dashboard spec needs it and they had all grown their own
 * copy.
 *
 * The wait is deliberately long. The login form is a server action, so the round trip is a POST that
 * Next has to compile the route for on a cold dev server; on a loaded CI runner the very first
 * sign-in of the suite has taken longer than the fifteen seconds assertions are given here, and the
 * whole browser suite failed on its first test for a reason that had nothing to do with the product.
 * Only the first spec ever pays this; the rest land in well under a second.
 */
export async function signIn(
  page: Page,
  credentials: { email?: string; password: string } = { password: requiredPassword() },
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Телефон или электронная почта").fill(credentials.email ?? "owner@demo-barber.local");
  await page.getByLabel("Пароль").fill(credentials.password);
  await page.getByRole("button", { name: "Войти в кабинет" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 45_000 });
}

function requiredPassword(): string {
  const value = process.env.DEMO_OWNER_PASSWORD;
  if (!value) throw new Error("DEMO_OWNER_PASSWORD is required to sign in");
  return value;
}
