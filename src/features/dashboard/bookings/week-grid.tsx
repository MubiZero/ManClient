import { Plus } from "lucide-react";
import Link from "next/link";

import type { WeekSchedule, WeekScheduleBooking, WeekScheduleDay } from "@/core/booking-operations/day-schedule-service";
import { cn } from "@/features/ui-kit/cn";

/**
 * Seven days at once. The day grid answers "where does Alisher have room this afternoon"; the week answers
 * the question that comes before it — "which day should I even offer" — so it trades the per-specialist
 * columns for one column per day and lays overlapping visits side by side inside it.
 */

/** Shorter than the day's scale: seven columns of nine hours have to fit a screen without scrolling away. */
const PIXELS_PER_MINUTE = 0.8;
const SLOT_MINUTES = 30;

const STATUS_STYLE: Record<string, string> = {
  CONFIRMED: "border-success/40 bg-success/12 text-foreground",
  PENDING_PAYMENT: "border-warning/50 bg-warning/12 text-foreground",
  NO_SHOW: "border-destructive/40 bg-destructive/10 text-foreground line-through",
};

export function WeekGrid({ schedule, today }: { schedule: WeekSchedule; today: string }) {
  const { viewStartMinute, viewEndMinute } = schedule;
  const height = (viewEndMinute - viewStartMinute) * PIXELS_PER_MINUTE;
  const hourMarks: number[] = [];
  for (let minute = Math.ceil(viewStartMinute / 60) * 60; minute <= viewEndMinute; minute += 60) hourMarks.push(minute);

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <div className="grid min-w-fit" style={{ gridTemplateColumns: `4rem repeat(${schedule.days.length}, minmax(7rem, 1fr))` }}>
        <div className="sticky left-0 z-20 border-b border-r border-border bg-card px-2 py-2 text-xs font-medium text-muted-foreground">
          {schedule.branchName}
        </div>
        {schedule.days.map((day) => (
          <Link
            key={day.date}
            href={`/dashboard/bookings?view=day&date=${day.date}`}
            className={cn(
              "border-b border-r border-border bg-card px-2 py-2 text-center last:border-r-0 hover:bg-secondary/60",
              day.date === today && "bg-accent",
            )}
          >
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{weekdayLabel(day, schedule.timeZone)}</p>
            <p className="text-sm font-semibold text-foreground">{dayLabel(day, schedule.timeZone)}</p>
            <p className="text-xs text-muted-foreground">{day.bookings.length ? `записей: ${day.bookings.length}` : "свободно"}</p>
          </Link>
        ))}

        <div className="sticky left-0 z-20 border-r border-border bg-card" style={{ height }}>
          {hourMarks.map((minute) => (
            <span
              key={minute}
              className="absolute right-2 -translate-y-1/2 text-xs tabular-nums text-muted-foreground"
              style={{ top: (minute - viewStartMinute) * PIXELS_PER_MINUTE }}
            >
              {formatMinute(schedule, minute)}
            </span>
          ))}
        </div>

        {schedule.days.map((day) => (
          <div key={day.date} className="relative border-r border-border bg-secondary/40 last:border-r-0" style={{ height }}>
            {day.workingIntervals.map((interval) => (
              <div
                key={`open-${interval.startMinute}`}
                className="absolute inset-x-0 bg-card"
                style={{ top: (interval.startMinute - viewStartMinute) * PIXELS_PER_MINUTE, height: (interval.endMinute - interval.startMinute) * PIXELS_PER_MINUTE }}
              />
            ))}
            {hourMarks.map((minute) => (
              <div
                key={`line-${minute}`}
                className="absolute inset-x-0 border-t border-border/70"
                style={{ top: (minute - viewStartMinute) * PIXELS_PER_MINUTE }}
              />
            ))}
            {schedule.staffId
              ? freeSlots(day, viewStartMinute, viewEndMinute).map((slot) => (
                  <Link
                    key={`slot-${slot}`}
                    href={newBookingHref(schedule, day, slot)}
                    className="absolute inset-x-1 flex items-center justify-center rounded-sm text-primary opacity-0 transition-opacity hover:bg-accent hover:opacity-100 focus-visible:bg-accent focus-visible:opacity-100 focus-visible:outline-none"
                    style={{ top: (slot - viewStartMinute) * PIXELS_PER_MINUTE, height: SLOT_MINUTES * PIXELS_PER_MINUTE }}
                  >
                    <Plus className="size-3.5" aria-hidden />
                    <span className="sr-only">{`Записать на ${formatMinute(schedule, slot)}, ${day.date}`}</span>
                  </Link>
                ))
              : null}
            {day.bookings.map((booking) => (
              <Link
                key={booking.id}
                href={`/dashboard/bookings/${booking.id}`}
                className={cn(
                  "absolute z-10 flex flex-col overflow-hidden rounded-sm border px-1.5 py-0.5 text-[11px] leading-tight transition-colors hover:brightness-95",
                  STATUS_STYLE[booking.status] ?? "border-border bg-secondary text-foreground",
                )}
                style={laneStyle(booking, viewStartMinute)}
              >
                <span className="font-semibold tabular-nums">{formatMinute(schedule, booking.startMinute)}</span>
                <span className="truncate font-medium">{booking.customerName}</span>
                <span className="truncate text-muted-foreground">{booking.staffName}</span>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Width and offset from the lane the booking was given. Percentages rather than pixels because the day
 * columns stretch to fill the screen, and a 1% gutter keeps two touching visits visibly separate.
 */
function laneStyle(booking: WeekScheduleBooking, viewStartMinute: number) {
  const width = 100 / booking.laneCount;
  return {
    top: (booking.startMinute - viewStartMinute) * PIXELS_PER_MINUTE,
    height: Math.max(18, (booking.endMinute - booking.startMinute) * PIXELS_PER_MINUTE),
    left: `calc(${booking.lane * width}% + 2px)`,
    width: `calc(${width}% - 4px)`,
  };
}

function freeSlots(day: WeekScheduleDay, viewStartMinute: number, viewEndMinute: number): number[] {
  const slots: number[] = [];
  for (const interval of day.freeIntervals) {
    const from = Math.max(interval.startMinute, viewStartMinute);
    const to = Math.min(interval.endMinute, viewEndMinute);
    for (let minute = Math.ceil(from / SLOT_MINUTES) * SLOT_MINUTES; minute + SLOT_MINUTES <= to; minute += SLOT_MINUTES) {
      slots.push(minute);
    }
  }
  return slots;
}

function newBookingHref(schedule: WeekSchedule, day: WeekScheduleDay, startMinute: number): string {
  const startsAt = new Date(day.dayStartsAt.getTime() + startMinute * 60_000);
  const params = new URLSearchParams({ branchId: schedule.branchId, staffId: schedule.staffId ?? "", date: day.date, startsAt: startsAt.toISOString() });
  return `/dashboard/bookings/new?${params.toString()}`;
}

/** Minutes are counted from the day's own start, so the clock label comes from the instant itself. */
function formatMinute(schedule: WeekSchedule, minute: number): string {
  const day = schedule.days[0];
  return new Intl.DateTimeFormat("ru-TJ", { timeZone: schedule.timeZone, hour: "2-digit", minute: "2-digit" })
    .format(new Date(day.dayStartsAt.getTime() + minute * 60_000));
}

function weekdayLabel(day: WeekScheduleDay, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone, weekday: "short" }).format(day.dayStartsAt);
}

function dayLabel(day: WeekScheduleDay, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone, day: "numeric", month: "short" }).format(day.dayStartsAt);
}
