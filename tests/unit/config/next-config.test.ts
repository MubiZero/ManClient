import { describe, expect, it } from "vitest";

import nextConfig from "../../../next.config";

describe("Next.js server dependency packaging", () => {
  it("keeps Tesseract and its language data external so runtime assets resolve from their packages", () => {
    expect(nextConfig.serverExternalPackages).toEqual(expect.arrayContaining([
      "tesseract.js",
      "@tesseract.js-data/eng",
      "@tesseract.js-data/rus",
    ]));
  });
});
