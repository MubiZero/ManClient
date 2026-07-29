import { afterEach, describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import { listCustomerBookings } from "@/core/bookings/customer-booking-query-service";
import { prisma } from "@/core/database/prisma";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("customer booking query", () => {
  const businessIds: string[] = [];
  afterEach(async () => { await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } }); });

  it("scopes the same Telegram chat to one tenant and paginates without duplication", async () => {
    const first = await createBookingFixture();
    const second = await createBookingFixture();
    businessIds.push(first.business.id, second.business.id);
    const one = await createPendingBooking({ businessSlug: first.business.slug, branchId: first.branch.id, serviceId: first.service.id, staffId: first.staff.id, resourceIds: [], startsAt: new Date("2026-08-02T05:00:00.000Z"), customer: { name: "Первый", phone: "+992900001411" } }, new Date("2026-08-01T04:00:00.000Z"));
    const two = await createPendingBooking({ businessSlug: second.business.slug, branchId: second.branch.id, serviceId: second.service.id, staffId: second.staff.id, resourceIds: [], startsAt: new Date("2026-08-02T05:00:00.000Z"), customer: { name: "Второй", phone: "+992900001412" } }, new Date("2026-08-01T04:00:00.000Z"));
    await prisma.customer.updateMany({ where: { businessId: { in: [first.business.id, second.business.id] } }, data: { telegramChatId: "900" } });

    const page = await listCustomerBookings({ businessId: first.business.id, telegramChatId: "900", limit: 1 });
    expect(page.items.map(item => item.id)).toEqual([one.bookingId]);
    expect(page.items.map(item => item.id)).not.toContain(two.bookingId);
  });
});
