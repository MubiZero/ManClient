import { describe, expect, it } from "vitest";

import { todayInTimeZone } from "@/core/formatting/dushanbe-date";

describe("Dushanbe date formatting", () => {
  it("uses the branch timezone instead of the UTC calendar day", () => {
    const nearMidnightUtc = new Date("2026-07-29T20:30:00.000Z");
    expect(todayInTimeZone("Asia/Dushanbe", nearMidnightUtc)).toBe("2026-07-30");
    expect(todayInTimeZone("UTC", nearMidnightUtc)).toBe("2026-07-29");
  });
});
