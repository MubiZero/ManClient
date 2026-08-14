import type { SupportedLocale } from "@/i18n/translate";

/**
 * Tajik month and weekday names, spelled the way Node's CLDR data spells them.
 *
 * They are written down here rather than looked up because only one of the two runtimes this code has
 * to agree with actually knows them. Node ships full ICU and formats `tg-TJ` properly; Chromium ships no
 * Tajik data at all and silently answers in `en-US`, so a Tajik-speaking customer picking a day saw
 * «Tue», «August 25» and «02:30 PM» the moment the browser took over the rendering — an English calendar
 * on a Tajik page, and a hydration mismatch wherever the server had already written the Tajik one.
 *
 * Russian keeps going through `Intl`: both runtimes carry `ru` and agree on it, and every screen and test
 * that reads Russian dates today should keep reading exactly what it reads now.
 */
const TAJIK_MONTHS_LONG = [
  "Январ", "Феврал", "Март", "Апрел", "Май", "Июн",
  "Июл", "Август", "Сентябр", "Октябр", "Ноябр", "Декабр",
] as const;

const TAJIK_MONTHS_SHORT = [
  "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
  "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
] as const;

/** Sunday first, matching `Date.prototype.getDay` and the parts below. */
const TAJIK_WEEKDAYS_SHORT = ["Яшб", "Дшб", "Сшб", "Чшб", "Пшб", "Ҷмъ", "Шнб"] as const;

type DateParts = { year: number; month: number; day: number; hour: string; minute: string; weekday: number };

/**
 * The numbers behind a moment in a given zone. `en-US` is the one locale every runtime carries, and only
 * its digits are read here — never its words — so the parts are the same wherever this runs.
 */
function partsIn(value: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = Object.fromEntries(formatter.formatToParts(value).map((part) => [part.type, part.value]));
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: parts.hour ?? "00",
    minute: parts.minute ?? "00",
    weekday: Math.max(0, weekdays.indexOf(parts.weekday ?? "Sun")),
  };
}

/** «14:30» — the same in both languages, and never the browser's idea of AM/PM. */
export function formatLocaleTime(value: Date, timeZone: string, locale: SupportedLocale): string {
  if (locale !== "tg") {
    return new Intl.DateTimeFormat("ru-RU", { timeZone, hour: "2-digit", minute: "2-digit" }).format(value);
  }
  const parts = partsIn(value, timeZone);
  return `${parts.hour}:${parts.minute}`;
}

/** «25 августа» / «25 Август» — a day the customer is standing in the door on. */
export function formatLocaleDayMonth(value: Date, timeZone: string, locale: SupportedLocale): string {
  if (locale !== "tg") {
    return new Intl.DateTimeFormat("ru-RU", { timeZone, day: "numeric", month: "long" }).format(value);
  }
  const parts = partsIn(value, timeZone);
  return `${parts.day} ${TAJIK_MONTHS_LONG[parts.month - 1]}`;
}

/** «25 августа, 14:30» / «25 Август, 14:30» — the visit, in one line. */
export function formatLocaleDayMonthTime(value: Date, timeZone: string, locale: SupportedLocale): string {
  if (locale !== "tg") {
    return new Intl.DateTimeFormat("ru-RU", { timeZone, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(value);
  }
  return `${formatLocaleDayMonth(value, timeZone, locale)}, ${formatLocaleTime(value, timeZone, locale)}`;
}

/** «вт» / «Сшб» — the weekday over the number in a day chip. */
export function formatLocaleWeekdayShort(value: Date, timeZone: string, locale: SupportedLocale): string {
  if (locale !== "tg") {
    return new Intl.DateTimeFormat("ru-RU", { timeZone, weekday: "short" }).format(value);
  }
  return TAJIK_WEEKDAYS_SHORT[partsIn(value, timeZone).weekday];
}

/** The day of the month alone: a strip never spans more than a month, so the month is implied. */
export function formatLocaleDayNumber(value: Date, timeZone: string, locale: SupportedLocale): string {
  if (locale !== "tg") {
    return new Intl.DateTimeFormat("ru-RU", { timeZone, day: "numeric" }).format(value);
  }
  return String(partsIn(value, timeZone).day);
}

/** «вт, 25 авг.» / «Сшб, 25 Авг» — a date offered as a button, where the weekday is the point. */
export function formatLocaleWeekdayDayMonth(value: Date, timeZone: string, locale: SupportedLocale): string {
  if (locale !== "tg") {
    return new Intl.DateTimeFormat("ru-RU", { timeZone, weekday: "short", day: "numeric", month: "short" }).format(value);
  }
  const parts = partsIn(value, timeZone);
  return `${TAJIK_WEEKDAYS_SHORT[parts.weekday]}, ${parts.day} ${TAJIK_MONTHS_SHORT[parts.month - 1]}`;
}
