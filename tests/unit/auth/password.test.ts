import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/core/auth/password";

describe("password hashing", () => {
  it("stores a salted hash and verifies the original password", async () => {
    const hash = await hashPassword("long-demo-password");

    expect(hash).not.toContain("long-demo-password");
    await expect(verifyPassword("long-demo-password", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });
});
