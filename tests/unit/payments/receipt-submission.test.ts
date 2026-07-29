import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { normalizeReceiptImage, ReceiptSubmissionError } from "@/core/payments/receipt-submission-service";

describe("receipt image validation", () => {
  it("normalizes a supported image and strips it to jpeg", async () => {
    const source = await sharp({ create: { width: 320, height: 480, channels: 3, background: "white" } }).png().toBuffer();
    const result = await normalizeReceiptImage(new File([source], "receipt.png", { type: "image/png" }));
    await expect(sharp(result.body).metadata()).resolves.toMatchObject({ format: "jpeg", width: 320, height: 480 });
    expect(result.contentType).toBe("image/jpeg");
  });

  it("rejects content that only pretends to be an image", async () => {
    const file = new File(["not an image"], "receipt.jpg", { type: "image/jpeg" });
    await expect(normalizeReceiptImage(file)).rejects.toMatchObject({ code: "INVALID_IMAGE" } satisfies Partial<ReceiptSubmissionError>);
  });
});
