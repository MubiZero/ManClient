export type TimeRange = {
  startsAt: Date;
  endsAt: Date;
};

export function overlaps(first: TimeRange, second: TimeRange): boolean {
  return first.startsAt < second.endsAt && first.endsAt > second.startsAt;
}
