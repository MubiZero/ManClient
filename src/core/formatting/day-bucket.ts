const dayLabelFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });

export type DailyBucket = { date: string; label: string; value: number };

export function bucketByDay<T>(
  items: T[],
  getDate: (item: T) => Date,
  getValue: (item: T) => number,
  days: number,
  now = new Date(),
): DailyBucket[] {
  const buckets = new Map<string, number>();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - offset);
    buckets.set(date.toISOString().slice(0, 10), 0);
  }

  for (const item of items) {
    const key = getDate(item).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + getValue(item));
  }

  return [...buckets.entries()].map(([date, value]) => ({
    date,
    label: dayLabelFormatter.format(new Date(`${date}T00:00:00Z`)),
    value,
  }));
}

export function daysAgo(days: number, now = new Date()): Date {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}
