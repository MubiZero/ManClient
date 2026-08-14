import { describe, expect, it } from "vitest";

import {
  formatLocaleDayMonth,
  formatLocaleDayMonthTime,
  formatLocaleDayNumber,
  formatLocaleTime,
  formatLocaleWeekdayDayMonth,
  formatLocaleWeekdayShort,
} from "@/core/formatting/locale-date";

const DUSHANBE = "Asia/Dushanbe";
/** 25 August 2026, 14:30 in Dushanbe — a Tuesday. */
const VISIT = new Date("2026-08-25T09:30:00Z");

/**
 * The Tajik expectations are spelled out rather than derived from `Intl`, because deriving them is the
 * bug: Chromium carries no Tajik data and answers in `en-US`, so a test that asked the runtime what to
 * expect would pass in Node and agree with «Tue, August 25, 02:30 PM» in the browser.
 */
describe("locale dates", () => {
  it("writes a Tajik date in Tajik, without asking the runtime whether it knows any", () => {
    expect(formatLocaleWeekdayShort(VISIT, DUSHANBE, "tg")).toBe("Сшб");
    expect(formatLocaleDayMonth(VISIT, DUSHANBE, "tg")).toBe("25 Август");
    expect(formatLocaleDayMonthTime(VISIT, DUSHANBE, "tg")).toBe("25 Август, 14:30");
    expect(formatLocaleWeekdayDayMonth(VISIT, DUSHANBE, "tg")).toBe("Сшб, 25 Авг");
    expect(formatLocaleDayNumber(VISIT, DUSHANBE, "tg")).toBe("25");
  });

  it("keeps a 24-hour clock in both languages, never AM/PM", () => {
    expect(formatLocaleTime(VISIT, DUSHANBE, "tg")).toBe("14:30");
    expect(formatLocaleTime(VISIT, DUSHANBE, "ru")).toBe("14:30");
    const evening = new Date("2026-08-25T19:05:00Z"); // 00:05 next day in Dushanbe
    expect(formatLocaleTime(evening, DUSHANBE, "tg")).toBe("00:05");
  });

  it("reads the clock of the branch, not of whoever is looking", () => {
    // Same moment, one hour earlier in Moscow: the customer is due at the time on the salon's wall.
    expect(formatLocaleTime(VISIT, "Europe/Moscow", "tg")).toBe("12:30");
    expect(formatLocaleDayMonth(new Date("2026-08-25T20:30:00Z"), DUSHANBE, "tg")).toBe("26 Август");
  });

  it("leaves Russian to Intl, which both runtimes agree on and every screen already reads", () => {
    expect(formatLocaleDayMonth(VISIT, DUSHANBE, "ru")).toBe("25 августа");
    expect(formatLocaleWeekdayShort(VISIT, DUSHANBE, "ru")).toBe("вт");
  });

  it("names every month and weekday, so none of them can fall back to a number", () => {
    const months = Array.from({ length: 12 }, (_, index) =>
      formatLocaleDayMonth(new Date(Date.UTC(2026, index, 15, 6)), DUSHANBE, "tg").replace("15 ", ""));
    expect(months).toEqual(["Январ", "Феврал", "Март", "Апрел", "Май", "Июн", "Июл", "Август", "Сентябр", "Октябр", "Ноябр", "Декабр"]);

    const weekdays = Array.from({ length: 7 }, (_, index) =>
      formatLocaleWeekdayShort(new Date(Date.UTC(2026, 0, 4 + index, 6)), DUSHANBE, "tg"));
    expect(weekdays).toEqual(["Яшб", "Дшб", "Сшб", "Чшб", "Пшб", "Ҷмъ", "Шнб"]);
  });
});
