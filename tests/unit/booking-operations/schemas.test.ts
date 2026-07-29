import { describe, expect, it } from "vitest";

import { parseBookingFilters } from "@/core/booking-operations/booking-operation-schemas";

describe("booking operation filters", () => {
  it("normalizes a useful day view", () => {
    expect(parseBookingFilters({ search: "  Мухаммад  ", limit: "20" }, "Asia/Dushanbe", new Date("2026-07-29T20:00:00.000Z"))).toMatchObject({
      view: "day",
      date: "2026-07-30",
      search: "Мухаммад",
      limit: 20,
    });
  });

  it("rejects unsupported status and unbounded limits", () => {
    expect(() => parseBookingFilters({ status: "PAID" }, "Asia/Dushanbe")).toThrow();
    expect(() => parseBookingFilters({ limit: 500 }, "Asia/Dushanbe")).toThrow();
  });
});
