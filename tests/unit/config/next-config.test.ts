import { describe, expect, it } from "vitest";

import nextConfig from "../../../next.config";

describe("Next.js server dependency packaging", () => {
  it("keeps Tesseract external so its worker resolves from the runtime package", () => {
    expect(nextConfig.serverExternalPackages).toContain("tesseract.js");
  });
});
