import { describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import { confirmFromReceipt } from "@/core/payments/payment-service";
import { prisma } from "@/core/database/prisma";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("payment audit log", () => {
  it("records receipt confirmation without storing a full card number", async () => {
    const fixture = await createBookingFixture();
    const pending = await createPendingBooking({ businessSlug: fixture.business.slug, branchId: fixture.branch.id, serviceId: fixture.service.id, staffId: fixture.staff.id, resourceIds: [], startsAt: new Date("2026-08-02T05:00:00.000Z"), customer: { name: "Мухаммад", phone: "+992900001122" } }, new Date("2026-08-01T04:00:00.000Z"));
    await confirmFromReceipt({ paymentId: pending.paymentId, receiptStorageKey: "receipts/audit.png", operationNumber: "991895624290", amountDiram: 5_000, recipientCardSuffix: "4444", operationAt: new Date("2026-08-01T04:05:00.000Z"), isSuccessful: true });

    const event = await prisma.auditEvent.findFirstOrThrow({ where: { bookingId: pending.bookingId, type: "booking.confirmed" } });
    expect(event.metadata).toMatchObject({ operationNumber: "991895624290", recipientCardSuffix: "4444" });
    expect(JSON.stringify(event.metadata)).not.toContain("1111222233334444");
    expect(event.metadata).not.toHaveProperty("cardNumber");
  });
});
