import { expect, test } from "@playwright/test";
import { Client } from "pg";

import { nextDate } from "./dates";

const SECOND_STAFF = "e2e-any-staff-zafar";

/**
 * Booking without naming a specialist. The demo barber ships with one master, so this spec lends it a
 * second for the duration and takes it back afterwards — the calendar specs rely on there being only
 * one, and a business that quietly grew a specialist would fail them for no reason.
 */
test("visitor books without choosing a specialist and still gets one", async ({ page }) => {
  const database = new Client({ connectionString: process.env.DATABASE_URL });
  await database.connect();
  const phone = `+99290${String(Date.now()).slice(-7)}`;

  try {
    await database.query(`
      INSERT INTO "StaffMember" (id, "businessId", "displayName", "createdAt", "updatedAt")
      SELECT $1, b.id, 'Зафар', NOW(), NOW() FROM "Business" b WHERE b.slug = 'demo-barber'
      ON CONFLICT (id) DO NOTHING
    `, [SECOND_STAFF]);
    await database.query(`
      INSERT INTO "StaffBranch" ("staffId", "branchId", "isPrimary")
      SELECT $1, br.id, false FROM "Branch" br
      JOIN "Business" b ON b.id = br."businessId" WHERE b.slug = 'demo-barber'
      ORDER BY br."createdAt" LIMIT 1
      ON CONFLICT DO NOTHING
    `, [SECOND_STAFF]);
    await database.query(`
      INSERT INTO "_ServiceToStaffMember" ("A", "B")
      SELECT s.id, $1 FROM "Service" s
      JOIN "Branch" br ON br.id = s."branchId"
      JOIN "Business" b ON b.id = br."businessId"
      WHERE b.slug = 'demo-barber' AND s.name = 'Мужская стрижка'
      ON CONFLICT DO NOTHING
    `, [SECOND_STAFF]);

    await page.goto("/b/demo-barber");
    const branch = page.getByRole("button", { name: "Душанбе, центр" });
    if (await branch.isVisible().catch(() => false)) await branch.click();
    await page.getByRole("button", { name: /Мужская стрижка/ }).click();

    // The choice the customer does not have to make.
    await page.getByRole("button", { name: /Любой свободный/ }).click();
    await page.getByLabel("Дата записи").fill(nextDate());
    await page.locator("[data-slot]").first().click();
    await page.getByLabel("Имя").fill("Мухаммад");
    await page.getByLabel("Телефон").fill(phone);
    await page.getByRole("button", { name: "Перейти к оплате" }).click();
    await expect(page).toHaveURL(/\/pay\//);

    // The booking names somebody: "anyone" is a question to the customer, never a row in the calendar.
    const rows = await database.query<{ staffId: string }>(
      `SELECT b."staffId" FROM "Booking" b JOIN "Customer" c ON c.id = b."customerId" WHERE c.phone = $1`,
      [phone],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].staffId).toBeTruthy();
  } finally {
    await database.query(`DELETE FROM "Booking" WHERE "customerId" IN (SELECT id FROM "Customer" WHERE phone = $1)`, [phone]);
    await database.query(`DELETE FROM "Customer" WHERE phone = $1`, [phone]);
    await database.query(`DELETE FROM "_ServiceToStaffMember" WHERE "B" = $1`, [SECOND_STAFF]);
    await database.query(`DELETE FROM "StaffBranch" WHERE "staffId" = $1`, [SECOND_STAFF]);
    await database.query(`DELETE FROM "StaffMember" WHERE id = $1`, [SECOND_STAFF]);
    await database.end();
  }
});
