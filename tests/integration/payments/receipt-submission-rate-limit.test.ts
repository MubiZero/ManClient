import { randomUUID } from "node:crypto";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { createPendingBooking } from "@/core/bookings/booking-service";
import { prisma } from "@/core/database/prisma";
import { ReceiptSubmissionError, submitReceiptImage } from "@/core/payments/receipt-submission-service";
import { createBookingFixture } from "@/../tests/helpers/booking-fixture";

describe("receipt submission rate limiting", () => {
  it("rejects a submission within the cooldown window after a recent one", async () => {
    const { paymentId } = await createReadyPayment();
    const dependencies = fakeDependencies();
    const baseTime = new Date("2026-08-01T04:00:00.000Z");

    await submitReceiptImage({ paymentId, bytes: await jpegBytes(), contentType: "image/jpeg", channel: "telegram" }, baseTime, dependencies);

    await expect(
      submitReceiptImage(
        { paymentId, bytes: await jpegBytes(), contentType: "image/jpeg", channel: "telegram" },
        new Date(baseTime.getTime() + 5_000),
        dependencies,
      ),
    ).rejects.toEqual(new ReceiptSubmissionError("RATE_LIMITED"));
  });

  it("allows a new submission once the cooldown has elapsed", async () => {
    const { paymentId } = await createReadyPayment();
    const dependencies = fakeDependencies();
    const baseTime = new Date("2026-08-01T04:00:00.000Z");

    await submitReceiptImage({ paymentId, bytes: await jpegBytes(), contentType: "image/jpeg", channel: "telegram" }, baseTime, dependencies);
    await expect(
      submitReceiptImage(
        { paymentId, bytes: await jpegBytes(), contentType: "image/jpeg", channel: "telegram" },
        new Date(baseTime.getTime() + 16_000),
        dependencies,
      ),
    ).resolves.toBeDefined();
  });

  it("rejects submissions past the total cap regardless of timing", async () => {
    const { paymentId } = await createReadyPayment();
    const dependencies = fakeDependencies();
    let time = new Date("2026-08-01T04:00:00.000Z").getTime();

    for (let index = 0; index < 5; index += 1) {
      await submitReceiptImage({ paymentId, bytes: await jpegBytes(), contentType: "image/jpeg", channel: "telegram" }, new Date(time), dependencies);
      time += 20_000;
    }

    await expect(
      submitReceiptImage({ paymentId, bytes: await jpegBytes(), contentType: "image/jpeg", channel: "telegram" }, new Date(time), dependencies),
    ).rejects.toEqual(new ReceiptSubmissionError("RATE_LIMITED"));
  });

  async function createReadyPayment() {
    const fixture = await createBookingFixture();
    const suffix = randomUUID().replace(/\D/g, "").padEnd(9, "3").slice(0, 9);
    const booking = await createPendingBooking(
      {
        businessSlug: fixture.business.slug,
        branchId: fixture.branch.id,
        serviceId: fixture.service.id,
        staffId: fixture.staff.id,
        resourceIds: [],
        startsAt: new Date("2026-08-02T05:00:00.000Z"),
        customer: { name: "Клиент", phone: `+992${suffix}` },
      },
      new Date("2026-08-01T04:00:00.000Z"),
    );
    return { paymentId: booking.paymentId };
  }

  function fakeDependencies() {
    return {
      async store() {
        return `receipts/rate-limit-${randomUUID()}.jpg`;
      },
      async recognize() {
        throw new Error("unreadable receipt");
      },
    };
  }

  async function jpegBytes() {
    return new Uint8Array(await sharp({ create: { width: 40, height: 40, channels: 3, background: "white" } }).jpeg().toBuffer());
  }
});
