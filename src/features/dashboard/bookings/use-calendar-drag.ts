"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";

import type { DayScheduleBooking } from "@/core/booking-operations/day-schedule-service";

/**
 * Dragging a visit across a calendar. The day grid and the week grid draw different things in their
 * columns — specialists and dates — but the gesture is identical: grab a block, move it vertically to
 * change the time and horizontally to change the column, and let the server decide whether the result is
 * allowed. Only the meaning of a column differs, so it is the one thing the caller supplies.
 */

/** Below this the gesture was a click on the block, not an attempt to move it. */
const DRAG_THRESHOLD_PIXELS = 4;

/**
 * Whether this pointer may move a visit at all. A finger may not, and that is the point: the drag
 * threshold is four pixels and the week view snaps in twelve-pixel steps, both smaller than the wobble
 * of a hand trying to scroll the day. On a phone the receptionist scrolled, the visit moved, and the
 * server accepted it — a client's appointment changed because somebody looked at their calendar.
 * Touch keeps the reschedule form in the booking card, which asks before it moves anything.
 */
export function pointerCanDrag(pointer: { pointerType: string; button: number }): boolean {
  // Left button only: a right-click is a context menu, and a middle-click opens the card in a new tab.
  if (pointer.button !== 0) return false;
  return pointer.pointerType !== "touch";
}

/** Statuses a visit can be moved in. A cancelled or missed visit is history, not a plan. */
const MOVABLE_STATUSES = ["CONFIRMED", "PENDING_PAYMENT"];

export type CalendarDrag = {
  bookingId: string;
  /** The column the pointer is currently over: a specialist in the day view, a date in the week view. */
  trackKey: string;
  startMinute: number;
  moved: boolean;
};

export type CalendarDragTarget = { bookingId: string; trackKey: string; startMinute: number };

type DraggableBooking = { id: string; startMinute: number; endMinute: number; status: string };

export function useCalendarDrag({
  pixelsPerMinute,
  snapMinutes,
  viewStartMinute,
  viewEndMinute,
  onDrop,
}: {
  pixelsPerMinute: number;
  snapMinutes: number;
  viewStartMinute: number;
  viewEndMinute: number;
  /** Absent when the caller cannot move visits; the blocks then behave as plain links. */
  onDrop?: (target: CalendarDragTarget) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const axisRef = useRef<HTMLElement | null>(null);
  const trackRefs = useRef(new Map<string, HTMLElement>());
  // The drag lives in a ref and is mirrored into state for rendering. Pointer moves arrive faster than
  // React commits, and reading the gesture back out of state made the release depend on whether the last
  // move had rendered yet.
  const activeRef = useRef<CalendarDrag | null>(null);
  const [drag, setDrag] = useState<CalendarDrag | null>(null);
  /**
   * Where a released visit is being moved to, held until the server has answered and the reloaded calendar
   * agrees. Without it the block snapped back to its old place the instant the mouse came up and jumped
   * again a second later — in the week view it visibly returned to the wrong day, which reads as a refusal
   * and invites the receptionist to drag again or walk away from a move that was going through.
   */
  const [pendingMove, setPendingMove] = useState<CalendarDragTarget | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [message, setMessage] = useState("");
  // A pointerup that ended a drag is followed by a click on the same element. The drag state is already
  // cleared by then — React may have re-rendered in between — so the fact that a drag happened has to
  // survive in a ref, or releasing the mouse would open the card that was just moved.
  const draggedRef = useRef(false);
  /** How far into the block the pointer grabbed it, so the visit does not jump under the cursor. */
  const grabRef = useRef(0);

  function minuteAt(clientY: number): number {
    const axis = axisRef.current?.getBoundingClientRect();
    if (!axis) return viewStartMinute;
    return viewStartMinute + (clientY - axis.top) / pixelsPerMinute;
  }

  function trackAt(clientX: number, fallback: string): string {
    for (const [key, element] of trackRefs.current) {
      const rect = element.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right) return key;
    }
    return fallback;
  }

  /**
   * Registers a column body. The first one registered also measures the shared vertical axis: every column
   * starts at the same pixel, so one reference is enough to turn a cursor position into a minute.
   */
  function registerTrack(key: string) {
    return (element: HTMLElement | null) => {
      if (element) {
        trackRefs.current.set(key, element);
        axisRef.current ??= element;
      } else {
        trackRefs.current.delete(key);
        if (axisRef.current === element) axisRef.current = null;
      }
    };
  }

  /**
   * The optimistic placement is honoured only while the move is on its way and the reloaded calendar has
   * not committed yet. Derived rather than cleared: the refresh transition stays pending until the fresh
   * props are on screen, so this becomes null in the very render that carries them — no flicker, and no
   * stale target left pinning a visit somewhere it no longer is.
   */
  const inFlightMove = submitting || refreshing ? pendingMove : null;

  function isDraggable(booking: DraggableBooking): boolean {
    return Boolean(onDrop) && MOVABLE_STATUSES.includes(booking.status);
  }

  function handlers(booking: DraggableBooking, trackKey: string) {
    return {
      onPointerDown(event: ReactPointerEvent<HTMLElement>) {
        if (!isDraggable(booking) || submitting) return;
        if (!pointerCanDrag(event)) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        grabRef.current = minuteAt(event.clientY) - booking.startMinute;
        setMessage("");
        activeRef.current = { bookingId: booking.id, trackKey, startMinute: booking.startMinute, moved: false };
        setDrag(activeRef.current);
      },
      onPointerMove(event: ReactPointerEvent<HTMLElement>) {

        const active = activeRef.current;
        if (!active || active.bookingId !== booking.id) return;
        const duration = booking.endMinute - booking.startMinute;
        const raw = minuteAt(event.clientY) - grabRef.current;
        const snapped = Math.round(raw / snapMinutes) * snapMinutes;
        const startMinute = Math.min(Math.max(snapped, viewStartMinute), viewEndMinute - duration);
        const nextTrack = trackAt(event.clientX, active.trackKey);
        const moved = active.moved
          || Math.abs(raw - booking.startMinute) * pixelsPerMinute > DRAG_THRESHOLD_PIXELS
          || nextTrack !== trackKey;
        activeRef.current = { ...active, startMinute, trackKey: nextTrack, moved };
        setDrag(activeRef.current);
      },
      async onPointerUp() {
        const current = activeRef.current;
        activeRef.current = null;
        setDrag(null);
        if (!current || !onDrop || !current.moved) return;
        draggedRef.current = true;
        if (current.startMinute === booking.startMinute && current.trackKey === trackKey) return;

        const target = { bookingId: booking.id, trackKey: current.trackKey, startMinute: current.startMinute };
        setPendingMove(target);
        setSubmitting(true);
        try {
          const result = await onDrop(target);
          if (result.error) {
            // A refusal puts the visit back where it really is and says why, rather than leaving a picture
            // that disagrees with the database.
            setMessage(moveErrorMessage(result.error));
            setPendingMove(null);
          } else {
            startRefresh(() => router.refresh());
          }
        } catch {
          setMessage("Не удалось перенести запись. Попробуйте ещё раз.");
          setPendingMove(null);
        } finally {
          setSubmitting(false);
        }
      },
      onClick(event: { preventDefault: () => void }) {
        // Always consumed, never short-circuited: a flag left set would swallow the next real click.
        const afterDrag = draggedRef.current;
        draggedRef.current = false;
        if (afterDrag || drag?.bookingId === booking.id) event.preventDefault();
      },
    };
  }

  return {
    /** Non-null only for the block being dragged, so the rest of the grid renders unchanged. */
    dragOf: (bookingId: string) => (drag?.bookingId === bookingId ? drag : null),
    activeTrack: drag?.trackKey ?? inFlightMove?.trackKey ?? null,
    pendingMove: inFlightMove,
    /** True while a move is on its way to the server, so the grid can say so rather than only dim itself. */
    saving: submitting,
    message,
    isDraggable,
    registerTrack,
    handlers,
  };
}

/**
 * The bookings each column should draw, with a move that is still being confirmed already applied. The
 * visit leaves the column it came from and appears in the one it was dropped in, at full width — a visit
 * cannot be in two places, and the receptionist has to see the answer they gave.
 */
export function applyPendingMove<T extends DayScheduleBooking>(
  tracks: Array<{ key: string; bookings: T[] }>,
  move: CalendarDragTarget | null,
): Map<string, T[]> {
  const placed = new Map(tracks.map((track) => [track.key, track.bookings]));
  if (!move) return placed;

  const moving = tracks.flatMap((track) => track.bookings).find((booking) => booking.id === move.bookingId);
  if (!moving) return placed;

  for (const track of tracks) {
    const withoutMoving = track.bookings.filter((booking) => booking.id !== move.bookingId);
    placed.set(track.key, track.key === move.trackKey
      ? [...withoutMoving, {
          ...moving,
          startMinute: move.startMinute,
          endMinute: move.startMinute + (moving.endMinute - moving.startMinute),
          blockedStartMinute: move.startMinute - (moving.startMinute - moving.blockedStartMinute),
          blockedEndMinute: move.startMinute + (moving.blockedEndMinute - moving.startMinute),
          lane: 0,
          laneCount: 1,
        }]
      : withoutMoving);
  }
  return placed;
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
