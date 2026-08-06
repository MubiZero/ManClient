"use client";

import { Plus } from "lucide-react";
import Link from "next/link";

import type { WeekSchedule, WeekScheduleDay } from "@/core/booking-operations/day-schedule-service";
import { BookingBlock } from "@/features/dashboard/bookings/booking-block";
import { useCalendarDrag, type CalendarDragTarget } from "@/features/dashboard/bookings/use-calendar-drag";
import { cn } from "@/features/ui-kit/cn";

/**
 * Seven days at once. The day grid answers "where does Alisher have room this afternoon"; the week answers
 * the question that comes before it — "which day should I even offer" — so it trades the per-specialist
 * columns for one column per day and lays overlapping visits side by side inside it.
 *
 * A column here is a date, so the same drag gesture that hands a visit to another specialist in the day
 * view moves it to another day. Whoever performs it stays as they were: the week shows the whole branch in
 * one column, and a horizontal drop says nothing about who should take it.
 */

/** Shorter than the day's scale: seven columns of nine hours have to fit a screen without scrolling away. */
const PIXELS_PER_MINUTE = 0.8;
const SLOT_MINUTES = 30;
const SNAP_MINUTES = 15;

/** In the week view a column is a date, so a drop says when — not who. */
export type MoveBookingToDayAction = (input: { bookingId: string; startsAt: string }) => Promise<{ error?: string }>;

export function WeekGrid({ schedule, today, moveAction }: { schedule: WeekSchedule; today: string; moveAction?: MoveBookingToDayAction }) {
  const { viewStartMinute, viewEndMinute } = schedule;
  const dayStarts = new Map(schedule.days.map((day) => [day.date, day.dayStartsAt]));
  const drag = useCalendarDrag({
    pixelsPerMinute: PIXELS_PER_MINUTE,
    snapMinutes: SNAP_MINUTES,
    viewStartMinute,
    viewEndMinute,
    onDrop: moveAction
      ? (target: CalendarDragTarget) => {
          // Each day carries its own start, so a week that contains a clock change still lands the visit at
          // the hour the receptionist dropped it on.
          const dayStartsAt = dayStarts.get(target.trackKey);
          if (!dayStartsAt) return Promise.resolve({ error: "INVALID_INPUT" });
          return moveAction({
            bookingId: target.bookingId,
            startsAt: new Date(dayStartsAt.getTime() + target.startMinute * 60_000).toISOString(),
          });
        }
      : undefined,
  });

  const height = (viewEndMinute - viewStartMinute) * PIXELS_PER_MINUTE;
  const hourMarks: number[] = [];
  for (let minute = Math.ceil(viewStartMinute / 60) * 60; minute <= viewEndMinute; minute += 60) hourMarks.push(minute);

  return (
    <div className="flex flex-col gap-2">
      {drag.message ? (
        <p className="text-sm text-destructive" role="alert">
          {drag.message}
        </p>
      ) : null}
      <div className={cn("overflow-x-auto rounded-lg border border-border bg-card", drag.pending && "opacity-60")}>
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
                drag.activeTrack === day.date && "bg-accent",
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
            <div
              key={day.date}
              ref={drag.registerTrack(day.date)}
              className="relative border-r border-border bg-secondary/40 last:border-r-0"
              style={{ height }}
            >
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
                <BookingBlock
                  key={booking.id}
                  booking={booking}
                  drag={drag.dragOf(booking.id)}
                  draggable={drag.isDraggable(booking)}
                  handlers={drag.handlers(booking, day.date)}
                  pixelsPerMinute={PIXELS_PER_MINUTE}
                  viewStartMinute={viewStartMinute}
                  compact
                  lines={[booking.customerName, booking.staffName]}
                  formatMinute={(minute) => formatMinute(schedule, minute)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
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

/** Minutes are counted from a day's own start, so the clock label comes from the instant itself. */
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
