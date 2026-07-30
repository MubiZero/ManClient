import { describe, expect, it } from "vitest";

import {
  formatBookingTime,
  getBookingStep,
  validateBookingPhone,
} from "@/features/public-booking/booking-form";

describe("public booking time formatting", () => {
  it("shows an available slot in the selected branch timezone", () => {
    expect(formatBookingTime("2026-08-02T07:00:00.000Z", "Europe/Berlin")).toBe(
      "09:00",
    );
  });
});

describe("public booking progress", () => {
  it("advances one recoverable choice at a time", () => {
    expect(
      getBookingStep({
        branchCount: 1,
        serviceId: "",
        staffId: "",
        date: "",
        startsAt: "",
      }),
    ).toBe("service");
    expect(
      getBookingStep({
        branchCount: 1,
        serviceId: "service-1",
        staffId: "",
        date: "",
        startsAt: "",
      }),
    ).toBe("staff");
    expect(
      getBookingStep({
        branchCount: 1,
        serviceId: "service-1",
        staffId: "staff-1",
        date: "",
        startsAt: "",
      }),
    ).toBe("time");
    expect(
      getBookingStep({
        branchCount: 1,
        serviceId: "service-1",
        staffId: "staff-1",
        date: "2026-08-02",
        startsAt: "2026-08-02T07:00:00.000Z",
      }),
    ).toBe("contact");
  });

  it("rejects an incomplete Tajik phone number without blocking input", () => {
    expect(validateBookingPhone("+992 90 123")).toBe(
      "Введите номер полностью: +992 90 123 45 67.",
    );
    expect(validateBookingPhone("+992 90 123 45 67")).toBeNull();
  });
});
