import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/bookings/route";
import { prisma } from "@/core/database/prisma";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("POST /api/bookings", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a 15-minute pending-payment booking", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-01T04:00:00.000Z"));
    const fixture = await createBookingFixture();

    const response = await POST(
      new Request("http://localhost/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessSlug: fixture.business.slug,
          branchId: fixture.branch.id,
          serviceId: fixture.service.id,
          staffId: fixture.staff.id,
          resourceIds: [],
          startsAt: "2026-08-02T05:00:00.000Z",
          customer: { name: "Мухаммад", phone: "+992900001122" },
        }),
      }),
    );
    const body = (await response.json()) as {
      bookingId: string;
      paymentId: string;
      expiresAt: string;
    };

    expect(response.status).toBe(201);
    expect(body.expiresAt).toBe("2026-08-01T04:15:00.000Z");
    await expect(prisma.booking.findUnique({ where: { id: body.bookingId } })).resolves.toMatchObject({
      status: "PENDING_PAYMENT",
    });
  });

  it("rejects a phone outside the +992 format", async () => {
    const fixture = await createBookingFixture();
    const response = await POST(
      new Request("http://localhost/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessSlug: fixture.business.slug,
          branchId: fixture.branch.id,
          serviceId: fixture.service.id,
          staffId: fixture.staff.id,
          resourceIds: [],
          startsAt: "2026-08-02T05:00:00.000Z",
          customer: { name: "Мухаммад", phone: "900001122" },
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects a slot outside the branch schedule", async () => {
    const fixture = await createBookingFixture();
    const response = await POST(
      new Request("http://localhost/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessSlug: fixture.business.slug,
          branchId: fixture.branch.id,
          serviceId: fixture.service.id,
          staffId: fixture.staff.id,
          resourceIds: [],
          startsAt: "2026-08-02T20:00:00.000Z",
          customer: { name: "Мухаммад", phone: "+992900001122" },
        }),
      }),
    );

    expect(response.status).toBe(400);
  });
});
