import { describe, expect, it } from "vitest";

import { can } from "@/core/auth/authorization";

describe("can", () => {
  it("does not let a staff member edit a branch", () => {
    expect(can("STAFF", "branch:update")).toBe(false);
  });
});
