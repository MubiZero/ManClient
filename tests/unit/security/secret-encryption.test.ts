import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "@/core/security/secret-encryption";

describe("integration secret encryption", () => {
  const key = Buffer.alloc(32, 9).toString("base64");

  it("keeps a Telegram token confidential and authenticated", () => {
    const ciphertext = encryptSecret("123456:telegram-token", key);
    const parts = ciphertext.split(".");
    parts[2] = `${parts[2][0] === "A" ? "B" : "A"}${parts[2].slice(1)}`;

    expect(ciphertext).not.toContain("telegram-token");
    expect(decryptSecret(ciphertext, key)).toBe("123456:telegram-token");
    expect(() => decryptSecret(parts.join("."), key)).toThrow();
  });

  it("requires a dedicated 32-byte integration key", () => {
    expect(() => encryptSecret("secret", Buffer.alloc(16).toString("base64"))).toThrow(
      "INTEGRATION_ENCRYPTION_KEY must decode to 32 bytes",
    );
  });
});
