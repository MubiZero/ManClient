"use client";

import { CalendarPlus, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import type { DaySchedule, DayScheduleBooking, DayScheduleColumn } from "@/core/booking-operations/day-schedule-service";
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
/** Below this the gesture was a click on the block, not an attempt to move it. */
const DRAG_THRESHOLD_PIXELS = 4;

const STATUS_STYLE: Record<string, string> = {
  CONFIRMED: "border-success/40 bg-success/12 text-foreground",
  PENDING_PAYMENT: "border-warning/50 bg-warning/12 text-foreground",
  NO_SHOW: "border-destructive/40 bg-destructive/10 text-foreground line-through",
};

const MOVABLE_STATUSES = ["CONFIRMED", "PENDING_PAYMENT"];

export type MoveBookingAction = (input: { bookingId: string; startsAt: string; staffId: string }) => Promise<{ error?: string }>;

type Drag = {
  bookingId: string;
  /** Where in the block the pointer grabbed it, so the visit does not jump under the cursor. */
  grabMinutes: number;
  startMinute: number;
  staffId: string;
  moved: boolean;
};

export function DayGrid({ schedule, now, moveAction }: { schedule: DaySchedule; now?: Date; moveAction?: MoveBookingAction }) {
  const router = useRouter();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const columnRefs = useRef(new Map<string, HTMLDivElement>());
  const [drag, setDrag] = useState<Drag | null>(null);
  // A pointerup that ended a drag is followed by a click on the same element. The drag state is already
  // cleared by then — React may have re-rendered in between — so the fact that a drag happened has to
  // survive in a ref, or releasing the mouse would open the card the receptionist just moved.
  const draggedRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  if (schedule.columns.length === 0) {
    return (
      <EmptyState
        icon={CalendarPlus}
        title="В этом филиале нет специалистов"
        description="Добавьте специалиста и его график, чтобы календарь показывал рабочий день."
      />
    );
  }

  const { viewStartMinute, viewEndMinute } = schedule;
  const height = (viewEndMinute - viewStartMinute) * PIXELS_PER_MINUTE;
  const formatMinute = (minute: number) =>
    new Intl.DateTimeFormat("ru-TJ", { timeZone: schedule.timeZone, hour: "2-digit", minute: "2-digit" })
      .format(new Date(schedule.dayStartsAt.getTime() + minute * 60_000));
  const hourMarks: number[] = [];
  for (let minute = Math.ceil(viewStartMinute / 60) * 60; minute <= viewEndMinute; minute += 60) hourMarks.push(minute);
  const nowMinute = now ? Math.round((now.getTime() - schedule.dayStartsAt.getTime()) / 60_000) : null;

  function minuteAt(clientY: number): number {
    const body = bodyRef.current?.getBoundingClientRect();
    if (!body) return viewStartMinute;
    return viewStartMinute + (clientY - body.top) / PIXELS_PER_MINUTE;
  }

  function columnAt(clientX: number, fallback: string): string {
    for (const [staffId, element] of columnRefs.current) {
      const rect = element.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right) return staffId;
    }
    return fallback;
  }

  function startDrag(event: ReactPointerEvent<HTMLElement>, booking: DayScheduleBooking, staffId: string) {
    if (!moveAction || pending || !MOVABLE_STATUSES.includes(booking.status)) return;
    // Left button only: a right-click is a context menu, and a middle-click opens the card in a new tab.
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setMessage("");
    setDrag({
      bookingId: booking.id,
      grabMinutes: minuteAt(event.clientY) - booking.startMinute,
      startMinute: booking.startMinute,
      staffId,
      moved: false,
    });
  }

  function moveDrag(event: ReactPointerEvent<HTMLElement>, booking: DayScheduleBooking) {
    if (!drag || drag.bookingId !== booking.id) return;
    const duration = booking.endMinute - booking.startMinute;
    const raw = minuteAt(event.clientY) - drag.grabMinutes;
    const snapped = Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES;
    const startMinute = Math.min(Math.max(snapped, viewStartMinute), viewEndMinute - duration);
    const staffId = columnAt(event.clientX, drag.staffId);
    const moved = drag.moved || Math.abs(raw - booking.startMinute) * PIXELS_PER_MINUTE > DRAG_THRESHOLD_PIXELS || staffId !== drag.staffId;
    setDrag({ ...drag, startMinute, staffId, moved });
  }

  /**
   * Reads and clears the "a drag just ended" flag. Lives here rather than in the block because the flag is
   * this component's ref: a child cannot be handed a ref to mutate.
   */
  function consumeDragSuppression(): boolean {
    if (!draggedRef.current) return false;
    draggedRef.current = false;
    return true;
  }

  async function endDrag(booking: DayScheduleBooking, originalStaffId: string) {
    const current = drag;
    setDrag(null);
    if (!current || !moveAction || !current.moved) return;
    draggedRef.current = true;
    if (current.startMinute === booking.startMinute && current.staffId === originalStaffId) return;

    setPending(true);
    const startsAt = new Date(schedule.dayStartsAt.getTime() + current.startMinute * 60_000);
    try {
      const result = await moveAction({ bookingId: booking.id, startsAt: startsAt.toISOString(), staffId: current.staffId });
      if (result.error) setMessage(moveErrorMessage(result.error));
      else router.refresh();
    } catch {
      setMessage("Не удалось перенести запись. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {message ? (
        <p className="text-sm text-destructive" role="alert">
          {message}
        </p>
      ) : null}
      <div className={cn("overflow-x-auto rounded-lg border border-border bg-card", pending && "opacity-60")}>
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
                drag && drag.staffId === column.staffId && "bg-accent",
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

          {schedule.columns.map((column, index) => (
            <div
              key={column.staffId}
              ref={(element) => {
                if (element) columnRefs.current.set(column.staffId, element);
                else columnRefs.current.delete(column.staffId);
                // Every column starts at the same pixel, so the first one is enough to measure the shared
                // vertical axis and turn a cursor position into a minute.
                if (index === 0) bodyRef.current = element;
              }}
              // Closed hours are the default background: what a business does not work is the larger part of
              // most days, and painting openness on top of it is what makes a schedule gap visible at all.
              className="relative border-r border-border bg-secondary/40 last:border-r-0"
              style={{ height }}
            >
              {column.workingIntervals.map((interval) => (
                <div key={`open-${interval.startMinute}`} className="absolute inset-x-0 bg-card" style={blockStyle(interval, viewStartMinute)} />
              ))}
              {hourMarks.map((minute) => (
                <div key={`line-${minute}`} className="absolute inset-x-0 border-t border-border/70" style={{ top: (minute - viewStartMinute) * PIXELS_PER_MINUTE }} />
              ))}
              {freeSlots(column, viewStartMinute, viewEndMinute).map((slot) => (
                <Link
                  key={`slot-${slot.startMinute}`}
                  href={newBookingHref(schedule, column.staffId, slot.startMinute)}
                  className="group absolute inset-x-1 flex items-center justify-center rounded-sm text-primary opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  style={blockStyle(slot, viewStartMinute)}
                >
                  <Plus className="size-4" aria-hidden />
                  <span className="sr-only">{`Записать на ${formatMinute(slot.startMinute)}, ${column.displayName}`}</span>
                </Link>
              ))}
              {column.bookings.map((booking) => (
                <BookingBlock
                  key={booking.id}
                  booking={booking}
                  staffId={column.staffId}
                  viewStartMinute={viewStartMinute}
                  formatMinute={formatMinute}
                  drag={drag?.bookingId === booking.id ? drag : null}
                  onSuppressedClick={consumeDragSuppression}
                  draggable={Boolean(moveAction) && MOVABLE_STATUSES.includes(booking.status)}
                  onPointerDown={startDrag}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
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

function BookingBlock({
  booking,
  staffId,
  viewStartMinute,
  formatMinute,
  drag,
  draggable,
  onSuppressedClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  booking: DayScheduleBooking;
  staffId: string;
  viewStartMinute: number;
  formatMinute: (minute: number) => string;
  drag: Drag | null;
  draggable: boolean;
  onSuppressedClick: () => boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, booking: DayScheduleBooking, staffId: string) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>, booking: DayScheduleBooking) => void;
  onPointerUp: (booking: DayScheduleBooking, staffId: string) => void;
}) {
  const hasBuffer = booking.blockedStartMinute < booking.startMinute || booking.blockedEndMinute > booking.endMinute;
  const startMinute = drag ? drag.startMinute : booking.startMinute;
  const endMinute = startMinute + (booking.endMinute - booking.startMinute);

  return (
    <>
      {hasBuffer && !drag ? (
        // The buffer is the specialist's time too, so it is drawn — otherwise the calendar looks like it
        // is refusing a gap for no reason.
        <div
          aria-hidden
          className="absolute inset-x-1 rounded-sm bg-muted"
          style={blockStyle({ startMinute: booking.blockedStartMinute, endMinute: booking.blockedEndMinute }, viewStartMinute)}
        />
      ) : null}
      <Link
        href={`/dashboard/bookings/${booking.id}`}
        draggable={false}
        onPointerDown={(event) => onPointerDown(event, booking, staffId)}
        onPointerMove={(event) => onPointerMove(event, booking)}
        onPointerUp={() => onPointerUp(booking, staffId)}
        // A drag ends over the block and would otherwise be delivered as a click on the link, opening the
        // card the receptionist just finished moving.
        onClick={(event) => {
          // Always consumed, never short-circuited: a flag left set would swallow the next real click.
          const afterDrag = onSuppressedClick();
          if (drag?.moved || afterDrag) event.preventDefault();
        }}
        className={cn(
          "absolute inset-x-1 z-10 flex touch-none flex-col overflow-hidden rounded-sm border px-2 py-1 text-xs leading-tight transition-colors hover:brightness-95",
          draggable && "cursor-grab",
          drag && "z-30 cursor-grabbing opacity-90 shadow-lg ring-2 ring-primary",
          STATUS_STYLE[booking.status] ?? "border-border bg-secondary text-foreground",
        )}
        style={blockStyle({ startMinute, endMinute }, viewStartMinute)}
      >
        <span className="font-semibold tabular-nums">{formatMinute(startMinute)}</span>
        <span className="truncate font-medium">{booking.customerName}</span>
        <span className="truncate text-muted-foreground">{booking.serviceName}</span>
      </Link>
    </>
  );
}

function moveErrorMessage(code: string): string {
  return ({
    SLOT_UNAVAILABLE: "В это время специалист или ресурс уже заняты. Выберите другое время.",
    INVALID_INPUT: "Перенести запись можно только на будущее время.",
    FORBIDDEN: "Переносить запись другому специалисту может только владелец или администратор.",
    NOT_FOUND: "Этот специалист не выполняет услугу или не работает в филиале.",
    INVALID_STATUS: "Эту запись уже нельзя перенести.",
  } as Record<string, string>)[code] ?? "Не удалось перенести запись. Попробуйте ещё раз.";
}

function blockStyle(interval: { startMinute: number; endMinute: number }, viewStartMinute: number) {
  return {
    top: (interval.startMinute - viewStartMinute) * PIXELS_PER_MINUTE,
    height: (interval.endMinute - interval.startMinute) * PIXELS_PER_MINUTE,
  };
}

/**
 * Whole slots inside the free time, aligned to the clock rather than to the end of the previous visit —
 * a receptionist reads "11:30", not "11:22". A gap too short for one slot offers nothing, which is honest:
 * the shortest service would not fit either.
 */
function freeSlots(column: DayScheduleColumn, viewStartMinute: number, viewEndMinute: number) {
  const slots: Array<{ startMinute: number; endMinute: number }> = [];
  for (const interval of column.freeIntervals) {
    const from = Math.max(interval.startMinute, viewStartMinute);
    const to = Math.min(interval.endMinute, viewEndMinute);
    for (let minute = Math.ceil(from / SLOT_MINUTES) * SLOT_MINUTES; minute + SLOT_MINUTES <= to; minute += SLOT_MINUTES) {
      slots.push({ startMinute: minute, endMinute: minute + SLOT_MINUTES });
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
