import { afterEach, describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

/**
 * What the prepayment rule does to a real booking. The failures worth guarding are the expensive ones: a
 * visit left waiting for money nobody was asked for and cancelled fifteen minutes later, a deposit that
 * loses the price of the visit so the business cannot collect the balance, and a business paid on the
 * premises that quietly stops sending reminders because reminders were wired to receipts.
 */

const CREATED_AT = new Date("2026-08-01T04:00:00.000Z");
/** 2026-08-02 is a Sunday, the fixture branch's working day. Price is 50.00 somoni. */
const VISIT = new Date("2026-08-02T05:00:00.000Z");

const businessIds: string[] = [];

describe("deposits and prepayment", () => {
  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
  });

  it("asks for the whole price and records it as the price, by default", async () => {
    const fixture = await setup();

    const created = await book(fixture, "+992900005001");

    expect(created.prepayment).toMatchObject({ mode: "FULL", dueDiram: 5_000, totalDiram: 5_000 });
    await expect(prisma.booking.findUniqueOrThrow({ where: { id: created.bookingId }, include: { payment: true } })).resolves.toMatchObject({
      status: "PENDING_PAYMENT",
      payment: { status: "PENDING", amountDiram: 5_000, totalDiram: 5_000 },
    });
    expect(created.expiresAt).not.toBeNull();
  });

  it("asks for a deposit and remembers what is still owed", async () => {
    const fixture = await setup({ prepaymentMode: "DEPOSIT", depositPercent: 30 });

    const created = await book(fixture, "+992900005002");

    // 30% of 50.00 is 15.00, and the remaining 35.00 is collected at the visit.
    expect(created.prepayment).toMatchObject({ mode: "DEPOSIT", dueDiram: 1_500, balanceDiram: 3_500 });
    await expect(prisma.payment.findUniqueOrThrow({ where: { bookingId: created.bookingId } })).resolves.toMatchObject({
      status: "PENDING",
      amountDiram: 1_500,
      totalDiram: 5_000,
    });
    // Still a reservation: the deposit has to arrive before the slot is anyone's.
    await expect(prisma.booking.findUniqueOrThrow({ where: { id: created.bookingId } })).resolves.toMatchObject({ status: "PENDING_PAYMENT" });
  });

  it("confirms immediately when nothing is due, and schedules the same messages a receipt would", async () => {
    const fixture = await setup({ prepaymentMode: "NONE" });
    // A channel has to exist for anything to be scheduled on, and WhatsApp needs no customer opt-in.
    await prisma.business.update({
      where: { id: fixture.business.id },
      data: { whatsappPhoneNumberId: "555", whatsappTemplateName: "reminder", whatsappConfirmationTemplateName: "confirmation" },
    });

    const created = await book(fixture, "+992900005003");

    expect(created.prepayment).toMatchObject({ mode: "NONE", dueDiram: 0, balanceDiram: 5_000 });
    expect(created.expiresAt).toBeNull();
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: created.bookingId }, include: { payment: true, messages: true } });
    expect(booking).toMatchObject({ status: "CONFIRMED", expiresAt: null, confirmedBy: "prepayment_not_required" });
    expect(booking.payment).toMatchObject({ status: "NOT_REQUIRED", amountDiram: 0, totalDiram: 5_000 });
    // The visit is certain, so the customer is told and later reminded — this is what used to hang off
    // the receipt and would otherwise be lost by a business that stopped taking money up front.
    expect(booking.messages.map((message) => message.kind).sort()).toEqual(["BOOKING_CONFIRMATION", "BOOKING_REMINDER"]);
  });

  it("lets one service demand a deposit while the rest of the business asks for nothing", async () => {
    const fixture = await setup({ prepaymentMode: "NONE" });
    await prisma.service.update({ where: { id: fixture.service.id }, data: { prepaymentMode: "DEPOSIT", depositAmountDiram: 2_000 } });

    const created = await book(fixture, "+992900005004");

    expect(created.prepayment).toMatchObject({ mode: "DEPOSIT", dueDiram: 2_000, balanceDiram: 3_000 });
  });

  it("does not require a recipient card from a business paid on the premises", async () => {
    const fixture = await setup({ prepaymentMode: "NONE" });
    await prisma.branch.update({ where: { id: fixture.branch.id }, data: { recipientCardEncrypted: null, recipientCardLast4: null } });

    await expect(book(fixture, "+992900005005")).resolves.toMatchObject({ prepayment: { dueDiram: 0 } });
  });

  it("still requires a recipient card when money is asked for", async () => {
    const fixture = await setup({ prepaymentMode: "DEPOSIT", depositPercent: 50 });
    await prisma.branch.update({ where: { id: fixture.branch.id }, data: { recipientCardEncrypted: null, recipientCardLast4: null } });

    await expect(book(fixture, "+992900005006")).rejects.toMatchObject({ code: "PAYMENT_NOT_CONFIGURED" });
  });
});

async function setup(policy?: { prepaymentMode: "FULL" | "DEPOSIT" | "NONE"; depositPercent?: number; depositAmountDiram?: number }) {
  const fixture = await createBookingFixture();
  businessIds.push(fixture.business.id);
  if (policy) await prisma.business.update({ where: { id: fixture.business.id }, data: policy });
  return fixture;
}

function book(fixture: Awaited<ReturnType<typeof createBookingFixture>>, phone: string) {
  return createPendingBooking({
    businessSlug: fixture.business.slug,
    branchId: fixture.branch.id,
    serviceId: fixture.service.id,
    staffId: fixture.staff.id,
    resourceIds: [],
    startsAt: VISIT,
    customer: { name: "Мухаммад", phone },
  }, CREATED_AT);
}
