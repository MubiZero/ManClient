/**
 * Interval arithmetic on minutes counted from the start of a branch's local day. The calendar grid needs
 * to know not only when someone is busy but when they are *open* — working hours minus lunch, plus a
 * one-off extra shift, minus a day off — and that is set subtraction, not a per-slot predicate like the
 * availability sweep does. Keeping it pure and unit-numbered means the grid, and later anything else that
 * needs to draw a day, share one implementation instead of each re-deriving it from schedule rows.
 */
export type MinuteInterval = { startMinute: number; endMinute: number };

/** Sorts, drops empty intervals and merges everything that overlaps or merely touches. */
export function normalizeIntervals(intervals: readonly MinuteInterval[]): MinuteInterval[] {
  const sorted = intervals
    .filter((interval) => interval.endMinute > interval.startMinute)
    .sort((left, right) => left.startMinute - right.startMinute || left.endMinute - right.endMinute);

  const merged: MinuteInterval[] = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    // Touching intervals are merged: 09:00–13:00 next to 13:00–18:00 is one working day, and drawing it
    // as two blocks would put a hairline of "closed" through the middle of an open afternoon.
    if (previous && interval.startMinute <= previous.endMinute) {
      previous.endMinute = Math.max(previous.endMinute, interval.endMinute);
      continue;
    }
    merged.push({ ...interval });
  }
  return merged;
}

export function subtractIntervals(from: readonly MinuteInterval[], remove: readonly MinuteInterval[]): MinuteInterval[] {
  const holes = normalizeIntervals(remove);
  const result: MinuteInterval[] = [];

  for (const interval of normalizeIntervals(from)) {
    let startMinute = interval.startMinute;
    for (const hole of holes) {
      if (hole.endMinute <= startMinute || hole.startMinute >= interval.endMinute) continue;
      if (hole.startMinute > startMinute) result.push({ startMinute, endMinute: hole.startMinute });
      startMinute = Math.max(startMinute, hole.endMinute);
    }
    if (startMinute < interval.endMinute) result.push({ startMinute, endMinute: interval.endMinute });
  }

  return result;
}

export function intersectIntervals(left: readonly MinuteInterval[], right: readonly MinuteInterval[]): MinuteInterval[] {
  const result: MinuteInterval[] = [];
  for (const first of normalizeIntervals(left)) {
    for (const second of normalizeIntervals(right)) {
      const startMinute = Math.max(first.startMinute, second.startMinute);
      const endMinute = Math.min(first.endMinute, second.endMinute);
      if (endMinute > startMinute) result.push({ startMinute, endMinute });
    }
  }
  return normalizeIntervals(result);
}

export function clampInterval(interval: MinuteInterval, bounds: MinuteInterval): MinuteInterval | null {
  const startMinute = Math.max(interval.startMinute, bounds.startMinute);
  const endMinute = Math.min(interval.endMinute, bounds.endMinute);
  return endMinute > startMinute ? { startMinute, endMinute } : null;
}

/**
 * Where an instant falls in the day being drawn, in minutes. Measured from the day's own start rather
 * than from a nominal midnight, so a day that is 23 or 25 hours long because a clock changed still
 * positions its bookings where they actually happened.
 */
export function minutesFromDayStart(value: Date, dayStartsAt: Date): number {
  return Math.round((value.getTime() - dayStartsAt.getTime()) / 60_000);
}
