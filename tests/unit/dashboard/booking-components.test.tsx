import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BookingFilters } from "@/features/dashboard/bookings/booking-filters";
import { BookingList } from "@/features/dashboard/bookings/booking-list";

describe("booking dashboard components", () => {
  it("renders URL filters", () => { const html = renderToStaticMarkup(<BookingFilters date="2026-07-29" view="day" search="" branches={[]} staff={[]} />); expect(html).toContain("Имя, телефон или услуга"); expect(html).toContain("Специалист"); });
  it("renders useful booking context", () => { const html = renderToStaticMarkup(<BookingList filtered={false} items={[{ id: "b1", startsAt: new Date("2026-08-02T05:00:00Z"), status: "CONFIRMED", branch: { name: "Центр", timeZone: "Asia/Dushanbe" }, customer: { name: "Мухаммад", phone: "+992900001122" }, service: { name: "Стрижка", amountDiram: 5000 }, staff: { displayName: "Алишер" }, payment: { status: "PENDING", amountDiram: 5000 } }]} />); expect(html).toContain("Мухаммад"); expect(html).toContain("Не оплачено"); expect(html).toContain("Подтверждена"); });
});
