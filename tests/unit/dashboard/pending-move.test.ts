import { describe, expect, it } from "vitest";

import type { DayScheduleBooking } from "@/core/booking-operations/day-schedule-service";
import { applyPendingMove } from "@/features/dashboard/bookings/use-calendar-drag";

/**
 * What the calendar draws between letting go of a visit and the server confirming it. Without this the
 * block snapped back to where it came from the instant the mouse came up and jumped again a second later —
 * in the week view it visibly returned to the wrong day, which reads as a refusal and invites the
 * receptionist either to drag again or to walk away from a move that was going through.
 */
describe("pending move placement", () => {
  it("moves the visit out of the column it came from and into the one it was dropped in", () => {
    const placed = applyPendingMove(
      [
        { key: "alisher", bookings: [booking("a", 600), booking("b", 720)] },
        { key: "zafar", bookings: [booking("c", 600)] },
      ],
      { bookingId: "a", trackKey: "zafar", startMinute: 780 },
    );

    expect(placed.get("alisher")?.map((item) => item.id)).toEqual(["b"]);
    expect(placed.get("zafar")?.map((item) => item.id)).toEqual(["c", "a"]);
    // A visit cannot be in two places, and the copy shown carries the time it was dropped at.
    expect(placed.get("zafar")?.at(-1)).toMatchObject({ startMinute: 780, endMinute: 825, lane: 0, laneCount: 1 });
  });

  it("carries the service's buffers along with the visit", () => {
    const withBuffers = { ...booking("a", 600), blockedStartMinute: 585, blockedEndMinute: 675 };

    const placed = applyPendingMove([{ key: "alisher", bookings: [withBuffers] }], { bookingId: "a", trackKey: "alisher", startMinute: 660 });

    // Moved an hour later, the fifteen minutes of preparation and thirty of cleaning move with it.
    expect(placed.get("alisher")?.[0]).toMatchObject({ startMinute: 660, blockedStartMinute: 645, blockedEndMinute: 735 });
  });

  it("leaves every column alone when nothing is being moved", () => {
    const tracks = [{ key: "alisher", bookings: [booking("a", 600)] }];

    expect(applyPendingMove(tracks, null).get("alisher")).toEqual(tracks[0].bookings);
  });

  it("ignores a move whose visit is no longer on the calendar", () => {
    // The reload can arrive with the visit cancelled by somebody else; inventing a copy of it would be worse
    // than showing the day as it now is.
    const placed = applyPendingMove([{ key: "alisher", bookings: [booking("a", 600)] }], { bookingId: "gone", trackKey: "alisher", startMinute: 700 });

    expect(placed.get("alisher")?.map((item) => item.id)).toEqual(["a"]);
  });
});

function booking(id: string, startMinute: number): DayScheduleBooking {
  return {
    id,
    startsAt: new Date("2026-08-02T05:00:00.000Z"),
    startMinute,
    endMinute: startMinute + 45,
    blockedStartMinute: startMinute,
    blockedEndMinute: startMinute + 45,
    status: "CONFIRMED",
    customerName: "Клиент",
    customerPhone: "+992900000000",
    serviceName: "Стрижка",
    durationMinutes: 45,
    totalDiram: 5_000,
    paymentStatus: "PENDING",
    lane: 0,
    laneCount: 1,
  };
}
