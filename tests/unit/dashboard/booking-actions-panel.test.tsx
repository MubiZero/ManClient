// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BookingActionsPanel } from "@/features/dashboard/bookings/booking-actions-panel";

describe("BookingActionsPanel", () => {
  it("asks for confirmation before irreversible actions and only offers available-slot rescheduling", () => {
    render(
      <BookingActionsPanel
        canConfirm
        canMarkNoShow
        branchId="branch-1"
        serviceId="service-1"
        staffId="staff-1"
        timeZone="Asia/Dushanbe"
        bookingLabel="Мухаммад · 2 августа, 10:00"
        confirmAction={() => undefined}
        rescheduleAction={() => undefined}
        cancelAction={() => undefined}
        noShowAction={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "Подтвердить вручную" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Перенести запись" }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.innerHTML).not.toContain('type="datetime-local"');
    expect(screen.getByText("Свободное время")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Например, клиент попросил отменить"), { target: { value: "Клиент попросил отменить" } });
    fireEvent.click(screen.getByRole("button", { name: "Отменить запись" }));

    expect(screen.getByText("Действие нельзя отменить. Будет отменена запись: Мухаммад · 2 августа, 10:00.")).toBeTruthy();
  });
});
