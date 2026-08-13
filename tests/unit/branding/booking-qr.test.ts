import { describe, expect, it } from "vitest";

import { bookingQrTarget, printableSizeMm } from "@/core/branding/booking-qr";

/**
 * What gets printed and stuck on a mirror. A sticker outlives the deploy that made it, so what it
 * carries has to keep working for a year: the address a customer can type when the code is scratched,
 * the salon's own slug, and nothing that goes stale.
 */
describe("booking QR", () => {
  it("points at the salon's own page over https, with the source marked", () => {
    const target = bookingQrTarget("https://man.tj", "salon-rohat")!;

    expect(target.url).toBe("https://man.tj/b/salon-rohat?src=qr");
    // The address without the tracking tail is what a person reads off the card and types by hand.
    expect(target.readable).toBe("man.tj/b/salon-rohat");
  });

  it("refuses to build a target without a configured public address", () => {
    expect(bookingQrTarget("", "salon-rohat")).toBeNull();
  });

  it("sizes the code by how far away it is read from", () => {
    // The rule of thumb is one tenth of the reading distance: a mirror sticker is read from arm's
    // length, a door poster from a metre away, a business card from twenty centimetres.
    expect(printableSizeMm("sticker").code).toBe(45);
    expect(printableSizeMm("poster").code).toBe(90);
    expect(printableSizeMm("card").code).toBe(20);
    expect(printableSizeMm("tent").code).toBe(60);
  });

  it("gives every format a real paper size", () => {
    for (const format of ["sticker", "tent", "poster", "card"] as const) {
      const size = printableSizeMm(format);
      expect(size.width).toBeGreaterThan(size.code);
      expect(size.height).toBeGreaterThan(size.code);
    }
  });
});
