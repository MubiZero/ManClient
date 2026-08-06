"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * Dragging a visit across a calendar. The day grid and the week grid draw different things in their
 * columns — specialists and dates — but the gesture is identical: grab a block, move it vertically to
 * change the time and horizontally to change the column, and let the server decide whether the result is
 * allowed. Only the meaning of a column differs, so it is the one thing the caller supplies.
 */

/** Below this the gesture was a click on the block, not an attempt to move it. */
const DRAG_THRESHOLD_PIXELS = 4;

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
  const [pending, setPending] = useState(false);
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

  function isDraggable(booking: DraggableBooking): boolean {
    return Boolean(onDrop) && MOVABLE_STATUSES.includes(booking.status);
  }

  function handlers(booking: DraggableBooking, trackKey: string) {
    return {
      onPointerDown(event: ReactPointerEvent<HTMLElement>) {
        if (!isDraggable(booking) || pending) return;
        // Left button only: a right-click is a context menu, and a middle-click opens the card in a new tab.
        if (event.button !== 0) return;
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

        setPending(true);
        try {
          const result = await onDrop({ bookingId: booking.id, trackKey: current.trackKey, startMinute: current.startMinute });
          if (result.error) setMessage(moveErrorMessage(result.error));
          // Only refreshed on success, so a refused move leaves the picture — and the explanation — alone.
          else router.refresh();
        } catch {
          setMessage("Не удалось перенести запись. Попробуйте ещё раз.");
        } finally {
          setPending(false);
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
    activeTrack: drag?.trackKey ?? null,
    pending,
    message,
    isDraggable,
    registerTrack,
    handlers,
  };
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
