/**
 * Fallback for the handful of paths that format a time without a branch in hand. Every branch carries
 * its own `timeZone`, so this is a default rather than the product's timezone — code that has a branch
 * must pass it, or the first branch outside UTC+5 gets wrong times in its SMS and Telegram messages.
 */
export const DEFAULT_TIME_ZONE = "Asia/Dushanbe";

export function todayInTimeZone(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function localDateTimeToUtc(date: string, time: string, timeZone: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error("INVALID_LOCAL_DATE_TIME");
  }
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const localTimestamp = Date.UTC(year, month - 1, day, hour, minute);
  let result = localTimestamp;
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(result));
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const represented = Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day), Number(value.hour), Number(value.minute));
    result -= represented - localTimestamp;
  }
  return new Date(result);
}
