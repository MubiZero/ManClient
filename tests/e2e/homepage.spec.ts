import { expect, test } from "@playwright/test";

test("mobile feature labels do not overlap their descriptions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const facts = page.locator(".hero-facts > div");
  await expect(facts).toHaveCount(3);

  for (const fact of await facts.all()) {
    const label = await fact.locator("dt").boundingBox();
    const description = await fact.locator("dd").boundingBox();
    const labelOverflows = await fact.locator("dt").evaluate(
      element => element.scrollWidth > element.clientWidth,
    );

    expect(label).not.toBeNull();
    expect(description).not.toBeNull();
    expect(labelOverflows).toBe(false);
    expect(description!.x - (label!.x + label!.width)).toBeGreaterThanOrEqual(12);
  }
});
