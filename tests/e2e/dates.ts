/**
 * Dates for the browser suite, always relative to the day the suite runs.
 *
 * Literal dates rot. `2026-08-10` was comfortably in the future when it was written and became the
 * present, at which point the schedule form — whose date field carries `min` of today in the branch
 * timezone — silently refused to submit and the spec failed for a reason that had nothing to do with
 * the product. The suite gates the deploy, so a calendar page turning is not something it may notice.
 */

/** Every offset here is counted from today, and days are unambiguous once anchored to midday UTC. */
function atMiddayUtc(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * A date `daysAhead` days from now. The default of two days clears both today — which the min-lead
 * rule can eat into — and tomorrow, which a branch timezone five hours ahead of the runner may
 * already have reached.
 */
export function nextDate(daysAhead = 2): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + daysAhead);
  return toIso(value);
}

export function addDays(iso: string, days: number): string {
  const value = atMiddayUtc(iso);
  value.setUTCDate(value.getUTCDate() + days);
  return toIso(value);
}

/**
 * The next date falling on `weekday` (1 = Monday … 7 = Sunday) at least `minDaysAhead` days out.
 * The calendar specs need a known weekday because they assert on the week around it — which day
 * starts it, which ends it, and which column a visit is dragged into.
 */
export function nextWeekday(weekday: number, minDaysAhead = 7): string {
  let candidate = nextDate(minDaysAhead);
  for (let step = 0; step < 7; step += 1) {
    // getUTCDay is 0 for Sunday; the ISO numbering this takes reads Sunday as 7.
    if ((atMiddayUtc(candidate).getUTCDay() || 7) === weekday) return candidate;
    candidate = addDays(candidate, 1);
  }
  throw new Error(`No weekday ${weekday} within a week of ${candidate}`);
}

/** How a day column is headed: "15 сент" for 2026-09-15. Trailing dot dropped so it can be a regex. */
export function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", day: "numeric", month: "short" })
    .format(atMiddayUtc(iso))
    .replace(/\.$/, "");
}
