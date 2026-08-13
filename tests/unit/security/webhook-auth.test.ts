import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { matchesHmacSignature, matchesWebhookSecret } from "@/core/security/webhook-auth";

describe("webhook authentication", () => {
  it("accepts the registered secret and nothing near it", () => {
    expect(matchesWebhookSecret("tenant-secret", "tenant-secret")).toBe(true);
    expect(matchesWebhookSecret("tenant-secret", "tenant-secre")).toBe(false);
    expect(matchesWebhookSecret("tenant-secret", "tenant-secret-2")).toBe(false);
    expect(matchesWebhookSecret("tenant-secret", "Tenant-Secret")).toBe(false);
  });

  it("closes the door when the secret is missing on either side", () => {
    expect(matchesWebhookSecret(undefined, "anything")).toBe(false);
    expect(matchesWebhookSecret(null, "anything")).toBe(false);
    expect(matchesWebhookSecret("", "")).toBe(false);
    expect(matchesWebhookSecret("tenant-secret", null)).toBe(false);
    expect(matchesWebhookSecret("tenant-secret", "")).toBe(false);
  });

  it("verifies a Meta signature over the exact bytes that were sent", () => {
    const body = JSON.stringify({ entry: [{ changes: [] }] });
    const header = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;

    expect(matchesHmacSignature({ body, secret: "app-secret", header })).toBe(true);
    expect(matchesHmacSignature({ body: `${body} `, secret: "app-secret", header })).toBe(false);
    expect(matchesHmacSignature({ body, secret: "other-secret", header })).toBe(false);
  });

  it("rejects a signature that is absent, unprefixed or the wrong length", () => {
    const body = "{}";
    const digest = createHmac("sha256", "app-secret").update(body).digest("hex");

    expect(matchesHmacSignature({ body, secret: "app-secret", header: null })).toBe(false);
    expect(matchesHmacSignature({ body, secret: "app-secret", header: digest })).toBe(false);
    expect(matchesHmacSignature({ body, secret: "app-secret", header: "sha256=" })).toBe(false);
    expect(matchesHmacSignature({ body, secret: undefined, header: `sha256=${digest}` })).toBe(false);
  });
});
