"use client";

import { CalendarPlus, Plus } from "lucide-react";
import Link from "next/link";

import type { DaySchedule, DayScheduleColumn } from "@/core/booking-operations/day-schedule-service";
import { BookingBlock } from "@/features/dashboard/bookings/booking-block";
import { applyPendingMove, useCalendarDrag, type CalendarDragTarget } from "@/features/dashboard/bookings/use-calendar-drag";
import { cn } from "@/features/ui-kit/cn";
import { EmptyState } from "@/features/ui-kit/empty-state";

/**
 * The day as a calendar rather than a list. A list answers "who is coming"; a receptionist on the phone
 * needs "where does Alisher have forty minutes this afternoon", and that question is only answerable from
 * a picture that also shows closed hours, lunch and the buffers between visits.
 *
 * Visits can be dragged to another time or another specialist. Dragging is a pointer gesture and therefore
 * not available to everyone — the booking card keeps the form-based reschedule, which stays the accessible
 * path and the only one on touch-less input.
 */

/** Vertical scale. Seventy-two pixels an hour keeps a half-hour visit tall enough to hold two lines. */
const PIXELS_PER_MINUTE = 1.2;
/** Granularity of the clickable gaps. Matches the interval the dashboard's own availability sweep uses. */
const SLOT_MINUTES = 30;
/** Drag snapping. Finer than the slot grid, because moving a visit by a quarter hour is a real intention. */
const SNAP_MINUTES = 15;

/** In the day view a column is a specialist, so dropping a visit in one hands it to that person. */
export type MoveBookingAction = (input: { bookingId: string; startsAt: string; staffId: string }) => Promise<{ error?: string }>;

export function DayGrid({ schedule, now, moveAction }: { schedule: DaySchedule; now?: Date; moveAction?: MoveBookingAction }) {
  const { viewStartMinute, viewEndMinute } = schedule;
  const drag = useCalendarDrag({
    pixelsPerMinute: PIXELS_PER_MINUTE,
    snapMinutes: SNAP_MINUTES,
    viewStartMinute,
    viewEndMinute,
    onDrop: moveAction
      ? (target: CalendarDragTarget) => moveAction({
          bookingId: target.bookingId,
          startsAt: new Date(schedule.dayStartsAt.getTime() + target.startMinute * 60_000).toISOString(),
          staffId: target.trackKey,
        })
      : undefined,
  });

  if (schedule.columns.length === 0) {
    return (
      <EmptyState
        icon={CalendarPlus}
        title="В этом филиале нет специалистов"
        description="Добавьте специалиста и его график, чтобы календарь показывал рабочий день."
      />
    );
  }

  const height = (viewEndMinute - viewStartMinute) * PIXELS_PER_MINUTE;
  const formatMinute = (minute: number) =>
    new Intl.DateTimeFormat("ru-TJ", { timeZone: schedule.timeZone, hour: "2-digit", minute: "2-digit" })
      .format(new Date(schedule.dayStartsAt.getTime() + minute * 60_000));
  const hourMarks: number[] = [];
  for (let minute = Math.ceil(viewStartMinute / 60) * 60; minute <= viewEndMinute; minute += 60) hourMarks.push(minute);
  const nowMinute = now ? Math.round((now.getTime() - schedule.dayStartsAt.getTime()) / 60_000) : null;
  // A visit released over another column belongs to that column until the server says otherwise.
  const placed = applyPendingMove(schedule.columns.map((column) => ({ key: column.staffId, bookings: column.bookings })), drag.pendingMove);

  return (
    <div className="flex flex-col gap-2">
      {drag.message ? (
        <p className="text-sm text-destructive" role="alert">
          {drag.message}
        </p>
      ) : null}
      {drag.saving ? (
        <p className="text-sm text-muted-foreground" role="status">
          Переносим запись…
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <div
          className="grid min-w-fit"
          style={{ gridTemplateColumns: `4rem repeat(${schedule.columns.length}, minmax(11rem, 1fr))` }}
        >
          <div className="sticky left-0 z-20 border-b border-r border-border bg-card px-2 py-2 text-xs font-medium text-muted-foreground">
            {schedule.branchName}
          </div>
          {schedule.columns.map((column) => (
            <div
              key={column.staffId}
              className={cn(
                "border-b border-r border-border bg-card px-3 py-2 last:border-r-0",
                drag.activeTrack === column.staffId && "bg-accent",
              )}
            >
              <p className="truncate text-sm font-semibold text-foreground">{column.displayName}</p>
              <p className="text-xs text-muted-foreground">{summarize(column, formatMinute)}</p>
            </div>
          ))}

          <div className="sticky left-0 z-20 border-r border-border bg-card" style={{ height }}>
            {hourMarks.map((minute) => (
              <span
                key={minute}
                className="absolute right-2 -translate-y-1/2 text-xs tabular-nums text-muted-foreground"
                style={{ top: (minute - viewStartMinute) * PIXELS_PER_MINUTE }}
              >
                {formatMinute(minute)}
              </span>
            ))}
          </div>

          {schedule.columns.map((column) => (
            <div
              key={column.staffId}
              ref={drag.registerTrack(column.staffId)}
              // Closed hours are the default background: what a business does not work is the larger part of
              // most days, and painting openness on top of it is what makes a schedule gap visible at all.
              className="relative border-r border-border bg-secondary/40 last:border-r-0"
              style={{ height }}
            >
              {column.workingIntervals.map((interval) => (
                <div
                  key={`open-${interval.startMinute}`}
                  className="absolute inset-x-0 bg-card"
                  style={{
                    top: (interval.startMinute - viewStartMinute) * PIXELS_PER_MINUTE,
                    height: (interval.endMinute - interval.startMinute) * PIXELS_PER_MINUTE,
                  }}
                />
              ))}
              {hourMarks.map((minute) => (
                <div key={`line-${minute}`} className="absolute inset-x-0 border-t border-border/70" style={{ top: (minute - viewStartMinute) * PIXELS_PER_MINUTE }} />
              ))}
              {freeSlots(column, viewStartMinute, viewEndMinute).map((slot) => (
                <Link
                  key={`slot-${slot}`}
                  href={newBookingHref(schedule, column.staffId, slot)}
                  className="absolute inset-x-1 flex items-center justify-center rounded-sm text-primary opacity-0 transition-opacity hover:bg-accent hover:opacity-100 focus-visible:bg-accent focus-visible:opacity-100 focus-visible:outline-none"
                  style={{ top: (slot - viewStartMinute) * PIXELS_PER_MINUTE, height: SLOT_MINUTES * PIXELS_PER_MINUTE }}
                >
                  <Plus className="size-4" aria-hidden />
                  <span className="sr-only">{`Записать на ${formatMinute(slot)}, ${column.displayName}`}</span>
                </Link>
              ))}
              {(placed.get(column.staffId) ?? column.bookings).map((booking) => (
                <BookingBlock
                  key={booking.id}
                  booking={booking}
                  drag={drag.dragOf(booking.id)}
                  draggable={drag.isDraggable(booking)}
                  handlers={drag.handlers(booking, column.staffId)}
                  pixelsPerMinute={PIXELS_PER_MINUTE}
                  viewStartMinute={viewStartMinute}
                  showBuffer
                  lines={[booking.customerName, booking.serviceName]}
                  formatMinute={formatMinute}
                />
              ))}
              {nowMinute !== null && nowMinute > viewStartMinute && nowMinute < viewEndMinute ? (
                <div
                  aria-hidden
                  className="absolute inset-x-0 z-10 border-t-2 border-destructive"
                  style={{ top: (nowMinute - viewStartMinute) * PIXELS_PER_MINUTE }}
                />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Whole slots inside the free time, aligned to the clock rather than to the end of the previous visit —
 * a receptionist reads "11:30", not "11:22". A gap too short for one slot offers nothing, which is honest:
 * the shortest service would not fit either.
 */
function freeSlots(column: DayScheduleColumn, viewStartMinute: number, viewEndMinute: number): number[] {
  const slots: number[] = [];
  for (const interval of column.freeIntervals) {
    const from = Math.max(interval.startMinute, viewStartMinute);
    const to = Math.min(interval.endMinute, viewEndMinute);
    for (let minute = Math.ceil(from / SLOT_MINUTES) * SLOT_MINUTES; minute + SLOT_MINUTES <= to; minute += SLOT_MINUTES) {
      slots.push(minute);
    }
  }
  return slots;
}

function newBookingHref(schedule: DaySchedule, staffId: string, startMinute: number): string {
  const startsAt = new Date(schedule.dayStartsAt.getTime() + startMinute * 60_000);
  const params = new URLSearchParams({ branchId: schedule.branchId, staffId, date: schedule.date, startsAt: startsAt.toISOString() });
  return `/dashboard/bookings/new?${params.toString()}`;
}

function summarize(column: DayScheduleColumn, formatMinute: (minute: number) => string): string {
  if (column.archived) return "В архиве";
  if (column.workingIntervals.length === 0) return "Не работает";
  const hours = column.workingIntervals.map((interval) => `${formatMinute(interval.startMinute)}–${formatMinute(interval.endMinute)}`).join(", ");
  return column.bookings.length ? `${hours} · записей: ${column.bookings.length}` : hours;
}
