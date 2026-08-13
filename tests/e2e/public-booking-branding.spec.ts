import { expect, test } from "@playwright/test";
import { Client } from "pg";

/**
 * A salon picks its own colour, and the interface has to stay readable whatever it picks — the owner
 * sees their brand and assumes it is meant to look like that, so nobody reports a white-on-yellow
 * button. The whole brand scale is generated from the one colour; this checks the end of that chain,
 * the contrast a customer actually faces in daylight.
 */
test("a shouting brand colour still yields a readable button", async ({ page }) => {
  const database = new Client({ connectionString: process.env.DATABASE_URL });
  await database.connect();

  try {
    await database.query(`UPDATE "Business" SET "brandColor" = '#ffd400' WHERE slug = 'demo-barber'`);
    await page.goto("/b/demo-barber");
    // Another spec may have left the business with a second branch, in which case the form opens on
    // the branch step and the service is one tap further in.
    const branch = page.getByRole("button", { name: "Душанбе, центр" });
    if (await branch.isVisible().catch(() => false)) await branch.click();
    await expect(page.getByRole("button", { name: /Мужская стрижка/ }).first()).toBeVisible();

    const contrast = await page.evaluate(() => {
      const style = getComputedStyle(document.querySelector("main")!);
      const resolve = (value: string) => {
        const probe = document.createElement("div");
        probe.style.color = value;
        document.body.append(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        return resolved;
      };
      const luminance = (colour: string) => {
        const [red, green, blue] = (colour.match(/\d+/g) ?? []).slice(0, 3).map((channel) => {
          const value = Number(channel) / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      };
      const primary = luminance(resolve(style.getPropertyValue("--color-primary").trim()));
      const foreground = luminance(resolve(style.getPropertyValue("--color-primary-foreground").trim()));
      return (Math.max(primary, foreground) + 0.05) / (Math.min(primary, foreground) + 0.05);
    });

    expect(contrast).toBeGreaterThanOrEqual(4.5);
  } finally {
    await database.query(`UPDATE "Business" SET "brandColor" = NULL WHERE slug = 'demo-barber'`);
    await database.end();
  }
});
