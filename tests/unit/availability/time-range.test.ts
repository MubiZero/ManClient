import { describe, expect, it } from "vitest";

import { overlaps } from "@/core/availability/time-range";

describe("overlaps", () => {
  it("does not treat adjacent half-open intervals as overlapping", () => {
    expect(
      overlaps(
        { startsAt: new Date("2026-08-01T05:00:00.000Z"), endsAt: new Date("2026-08-01T06:00:00.000Z") },
        { startsAt: new Date("2026-08-01T06:00:00.000Z"), endsAt: new Date("2026-08-01T07:00:00.000Z") },
      ),
    ).toBe(false);
  });
});
