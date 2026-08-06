import { describe, expect, it } from "vitest";

import { clampInterval, intersectIntervals, minutesFromDayStart, normalizeIntervals, subtractIntervals } from "@/core/availability/day-intervals";

/**
 * The grid decides what to paint as open, closed and free by set arithmetic, so the failures worth
 * guarding are the ones that would draw a lie: a lunch break that leaves the afternoon looking closed, or
 * a gap the calendar offers that the reservation transaction would then refuse.
 */
describe("day intervals", () => {
  it("merges intervals that overlap or merely touch", () => {
    expect(normalizeIntervals([
      { startMinute: 540, endMinute: 780 },
      { startMinute: 780, endMinute: 1080 },
      { startMinute: 600, endMinute: 660 },
      { startMinute: 300, endMinute: 300 },
    ])).toEqual([{ startMinute: 540, endMinute: 1080 }]);
  });

  it("cuts a lunch break out of the working day and keeps both halves", () => {
    expect(subtractIntervals([{ startMinute: 540, endMinute: 1080 }], [{ startMinute: 780, endMinute: 840 }])).toEqual([
      { startMinute: 540, endMinute: 780 },
      { startMinute: 840, endMinute: 1080 },
    ]);
  });

  it("removes a day off entirely and survives holes wider than the day", () => {
    expect(subtractIntervals([{ startMinute: 540, endMinute: 1080 }], [{ startMinute: 0, endMinute: 1440 }])).toEqual([]);
  });

  it("leaves the day untouched when a hole falls outside it", () => {
    expect(subtractIntervals([{ startMinute: 540, endMinute: 1080 }], [{ startMinute: 1080, endMinute: 1200 }])).toEqual([
      { startMinute: 540, endMinute: 1080 },
    ]);
  });

  it("keeps only the hours both sides agree on", () => {
    expect(intersectIntervals(
      [{ startMinute: 540, endMinute: 780 }, { startMinute: 840, endMinute: 1080 }],
      [{ startMinute: 700, endMinute: 900 }],
    )).toEqual([
      { startMinute: 700, endMinute: 780 },
      { startMinute: 840, endMinute: 900 },
    ]);
  });

  it("clamps to the day and reports nothing left when there is no overlap", () => {
    expect(clampInterval({ startMinute: -120, endMinute: 600 }, { startMinute: 0, endMinute: 1440 })).toEqual({ startMinute: 0, endMinute: 600 });
    expect(clampInterval({ startMinute: 1440, endMinute: 1500 }, { startMinute: 0, endMinute: 1440 })).toBeNull();
  });

  it("positions an instant by the day it is drawn in, not by a nominal midnight", () => {
    const dayStartsAt = new Date("2026-08-01T19:00:00.000Z");
    expect(minutesFromDayStart(new Date("2026-08-02T04:00:00.000Z"), dayStartsAt)).toBe(540);
  });
});
