const AGO_FORMATTER = new Intl.RelativeTimeFormat("ru", { numeric: "always" });

/**
 * How long ago something happened, in the largest unit that still reads honestly. A review queue is
 * judged by waiting time, and "3 часа назад" answers that without subtracting dates in the head — the
 * exact moment stays alongside, in the timezone the reader lives in.
 */
export function formatTimeAgo(value: Date, now: Date = new Date()): string {
  const minutes = Math.round((value.getTime() - now.getTime()) / 60_000);
  if (Math.abs(minutes) < 1) return "только что";
  if (Math.abs(minutes) < 60) return AGO_FORMATTER.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return AGO_FORMATTER.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return AGO_FORMATTER.format(days, "day");
  return AGO_FORMATTER.format(Math.round(days / 30), "month");
}
