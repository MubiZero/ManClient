import { beforeEach, describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import { encryptCardNumber } from "@/core/payments/card-encryption";
import {
  DuplicateOperationError,
  confirmFromReceipt,
  getPaymentUrl,
} from "@/core/payments/payment-service";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

const cardNumber = "9762000128351953";
const encryptionKey = Buffer.alloc(32, 7).toString("base64");

describe("confirmFromReceipt", () => {
  beforeEach(async () => {
    process.env.CARD_ENCRYPTION_KEY = encryptionKey;
    await prisma.booking.deleteMany();
  });

  it("confirms a booking immediately from a matching receipt", async () => {
    const booking = await createPaymentReadyBooking();

    await expect(
      confirmFromReceipt({
        paymentId: booking.paymentId,
        receiptStorageKey: "receipts/receipt-1.png",
        operationNumber: "1895624290",
        amountDiram: 5_000,
        recipientCardSuffix: "1953",
        operationAt: new Date("2026-08-01T04:05:00.000Z"),
        isSuccessful: true,
      }),
    ).resolves.toMatchObject({ status: "RECEIPT_ACCEPTED", isBankVerified: false });
    await expect(prisma.booking.findUnique({ where: { id: booking.bookingId } })).resolves.toMatchObject({
      status: "CONFIRMED",
    });
  });

  it("builds the business-specific DushanbeCity payment URL", async () => {
    const booking = await createPaymentReadyBooking();

    await expect(getPaymentUrl(booking.paymentId)).resolves.toMatchObject({
      hostname: "pay.dc.tj",
      search: expect.stringContaining("A=9762000128351953"),
    });
  });

  it("does not accept an operation number twice", async () => {
    const first = await createPaymentReadyBooking();
    const second = await createPendingBooking(
      {
        businessSlug: first.fixture.business.slug,
        branchId: first.fixture.branch.id,
        serviceId: first.fixture.service.id,
        staffId: first.fixture.staff.id,
        resourceIds: [],
        startsAt: new Date("2026-08-02T06:00:00.000Z"),
        customer: { name: "Саид", phone: "+992900001123" },
      },
      new Date("2026-08-01T04:00:00.000Z"),
    );
    const receipt = {
      receiptStorageKey: "receipts/receipt-duplicate.png",
      operationNumber: "1895624291",
      amountDiram: 5_000,
      recipientCardSuffix: "1953",
      operationAt: new Date("2026-08-01T04:05:00.000Z"),
      isSuccessful: true,
    };

    await confirmFromReceipt({ ...receipt, paymentId: first.paymentId });
    await expect(confirmFromReceipt({ ...receipt, paymentId: second.paymentId })).rejects.toEqual(
      new DuplicateOperationError(),
    );
  });

  it("keeps a mismatched receipt for administrator attention", async () => {
    const booking = await createPaymentReadyBooking();

    await expect(
      confirmFromReceipt({
        paymentId: booking.paymentId,
        receiptStorageKey: "receipts/wrong-amount.png",
        operationNumber: "1895624292",
        amountDiram: 4_000,
        recipientCardSuffix: "1953",
        operationAt: new Date("2026-08-01T04:05:00.000Z"),
        isSuccessful: true,
      }),
    ).resolves.toMatchObject({ status: "NEEDS_ATTENTION" });
    await expect(prisma.booking.findUnique({ where: { id: booking.bookingId } })).resolves.toMatchObject({
      status: "PENDING_PAYMENT",
    });
  });

  it("accepts a retry of the same receipt for the same payment", async () => {
    const booking = await createPaymentReadyBooking();
    const receipt = {
      paymentId: booking.paymentId,
      receiptStorageKey: "receipts/retry.png",
      operationNumber: "1895624293",
      amountDiram: 5_000,
      recipientCardSuffix: "1953",
      operationAt: new Date("2026-08-01T04:05:00.000Z"),
      isSuccessful: true,
    };

    await confirmFromReceipt(receipt);
    await expect(confirmFromReceipt(receipt)).resolves.toMatchObject({ status: "RECEIPT_ACCEPTED" });
  });
});

async function createPaymentReadyBooking() {
  const fixture = await createBookingFixture();
  await prisma.branch.update({
    where: { id: fixture.branch.id },
    data: {
      recipientCardEncrypted: encryptCardNumber(cardNumber, encryptionKey),
      recipientCardLast4: cardNumber.slice(-4),
    },
  });

  const booking = await createPendingBooking(
    {
      businessSlug: fixture.business.slug,
      branchId: fixture.branch.id,
      serviceId: fixture.service.id,
      staffId: fixture.staff.id,
      resourceIds: [],
      startsAt: new Date("2026-08-02T05:00:00.000Z"),
      customer: { name: "Мухаммад", phone: "+992900001122" },
    },
    new Date("2026-08-01T04:00:00.000Z"),
  );

  return { ...booking, fixture };
}
