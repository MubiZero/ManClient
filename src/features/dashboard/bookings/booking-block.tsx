"use client";

import Link from "next/link";
import type { PointerEvent as ReactPointerEvent } from "react";

import type { DayScheduleBooking } from "@/core/booking-operations/day-schedule-service";
import { cn } from "@/features/ui-kit/cn";
import type { CalendarDrag } from "@/features/dashboard/bookings/use-calendar-drag";

/**
 * One visit drawn on a calendar. Shared by the day and the week so a booking looks and behaves the same in
 * both: the same colours for the same statuses, the same drag gesture, and the same refusal to open the
 * card when the mouse is released after a move.
 */

const STATUS_STYLE: Record<string, string> = {
  CONFIRMED: "border-success/40 bg-success/12 text-foreground",
  PENDING_PAYMENT: "border-warning/50 bg-warning/12 text-foreground",
  NO_SHOW: "border-destructive/40 bg-destructive/10 text-foreground line-through",
};

export type BookingBlockHandlers = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onClick: (event: { preventDefault: () => void }) => void;
};

export function BookingBlock({
  booking,
  drag,
  draggable,
  handlers,
  pixelsPerMinute,
  viewStartMinute,
  showBuffer = false,
  compact = false,
  lines,
  formatMinute,
}: {
  booking: DayScheduleBooking;
  drag: CalendarDrag | null;
  draggable: boolean;
  handlers: BookingBlockHandlers;
  pixelsPerMinute: number;
  viewStartMinute: number;
  /** The day view has room to show the minutes a service blocks either side of the visit; the week has not. */
  showBuffer?: boolean;
  compact?: boolean;
  lines: string[];
  formatMinute: (minute: number) => string;
}) {
  const startMinute = drag ? drag.startMinute : booking.startMinute;
  const endMinute = startMinute + (booking.endMinute - booking.startMinute);
  const hasBuffer = booking.blockedStartMinute < booking.startMinute || booking.blockedEndMinute > booking.endMinute;

  return (
    <>
      {showBuffer && hasBuffer && !drag ? (
        // The buffer is the specialist's time too, so it is drawn — otherwise the calendar looks like it
        // is refusing a gap for no reason.
        <div
          aria-hidden
          className="absolute rounded-sm bg-muted"
          style={laneStyle(
            { startMinute: booking.blockedStartMinute, endMinute: booking.blockedEndMinute, lane: booking.lane, laneCount: booking.laneCount },
            { pixelsPerMinute, viewStartMinute },
          )}
        />
      ) : null}
      <Link
        href={`/dashboard/bookings/${booking.id}`}
        draggable={false}
        onPointerDown={handlers.onPointerDown}
        onPointerMove={handlers.onPointerMove}
        onPointerUp={handlers.onPointerUp}
        onClick={handlers.onClick}
        className={cn(
          "absolute z-10 flex touch-none flex-col overflow-hidden rounded-sm border leading-tight transition-colors hover:brightness-95",
          compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs",
          draggable && "cursor-grab",
          drag && "z-30 cursor-grabbing opacity-90 shadow-lg ring-2 ring-primary",
          STATUS_STYLE[booking.status] ?? "border-border bg-secondary text-foreground",
        )}
        // A dragged block leaves its lane and takes the full column, so it is never hidden behind the
        // neighbour it is being moved away from.
        style={laneStyle(
          { startMinute, endMinute, lane: drag ? 0 : booking.lane, laneCount: drag ? 1 : booking.laneCount },
          { pixelsPerMinute, viewStartMinute },
        )}
      >
        <span className="font-semibold tabular-nums">{formatMinute(startMinute)}</span>
        {lines.map((line) => (
          <span key={line} className="truncate">
            {line}
          </span>
        ))}
      </Link>
    </>
  );
}

/**
 * Where a block sits in its column. Width comes from the lane it was given, as a percentage rather than
 * pixels because columns stretch to fill the screen; the two-pixel gutter keeps touching visits visibly
 * separate.
 */
export function laneStyle(
  placement: { startMinute: number; endMinute: number; lane: number; laneCount: number },
  axis: { pixelsPerMinute: number; viewStartMinute: number },
) {
  const width = 100 / Math.max(1, placement.laneCount);
  return {
    top: (placement.startMinute - axis.viewStartMinute) * axis.pixelsPerMinute,
    height: Math.max(18, (placement.endMinute - placement.startMinute) * axis.pixelsPerMinute),
    left: `calc(${placement.lane * width}% + 2px)`,
    width: `calc(${width}% - 4px)`,
  };
}
