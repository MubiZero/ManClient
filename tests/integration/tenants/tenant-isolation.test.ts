import { beforeEach, describe, expect, it } from "vitest";

import { requireBusinessMembership } from "@/core/tenants/tenant-context";
import { createBranch, createBusiness, listBranches } from "@/core/tenants/tenant-repository";

describe("tenant isolation", () => {
  beforeEach(async () => {
    await createBusiness({ id: "business-a", name: "Business A", slug: "business-a" });
    await createBusiness({ id: "business-b", name: "Business B", slug: "business-b" });
  });

  it("never returns another business branch", async () => {
    await createBranch({ businessId: "business-a", name: "A", slug: "a" });

    await expect(listBranches("business-b")).resolves.toEqual([]);
  });

  it("rejects a user without a business membership", async () => {
    await expect(requireBusinessMembership("unknown-user", "business-a")).rejects.toThrow(
      "Business membership is required",
    );
  });
});
