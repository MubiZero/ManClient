import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BookingActionsPanel } from "@/features/dashboard/bookings/booking-actions-panel";

describe("BookingActionsPanel", () => {
  it("asks for confirmation before irreversible actions and only offers available-slot rescheduling", () => {
    const html = renderToStaticMarkup(
      <BookingActionsPanel
        canConfirm
        branchId="branch-1"
        serviceId="service-1"
        staffId="staff-1"
        timeZone="Asia/Dushanbe"
        bookingLabel="Мухаммад · 2 августа, 10:00"
        confirmAction={() => undefined}
        rescheduleAction={() => undefined}
        cancelAction={() => undefined}
      />,
    );

    expect(html).toContain("Подтвердить вручную");
    expect(html).toContain("Перенести запись");
    expect(html).toContain("Отменить запись");
    expect(html).toContain("Действие нельзя отменить");
    expect(html).toContain("Мухаммад · 2 августа, 10:00");
    expect(html).toContain("Свободное время");
    expect(html).not.toContain('type="datetime-local"');
  });
});
