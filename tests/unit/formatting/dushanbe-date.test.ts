import { describe, expect, it } from "vitest";

import { localDateTimeToUtc, todayInTimeZone } from "@/core/formatting/dushanbe-date";

describe("Dushanbe date formatting", () => {
  it("uses the branch timezone instead of the UTC calendar day", () => {
    const nearMidnightUtc = new Date("2026-07-29T20:30:00.000Z");
    expect(todayInTimeZone("Asia/Dushanbe", nearMidnightUtc)).toBe("2026-07-30");
    expect(todayInTimeZone("UTC", nearMidnightUtc)).toBe("2026-07-29");
  });
});

it("converts a Dushanbe local time to UTC", () => {
  expect(localDateTimeToUtc("2026-08-03", "09:30", "Asia/Dushanbe")).toEqual(new Date("2026-08-03T04:30:00.000Z"));
});
