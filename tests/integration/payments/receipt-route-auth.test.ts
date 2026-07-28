import { beforeEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/payments/[paymentId]/receipt/route";

describe("POST /api/payments/:paymentId/receipt", () => {
  beforeEach(() => {
    process.env.INTERNAL_API_SECRET = "test-internal-secret";
  });

  it("rejects a request without the internal secret", async () => {
    const response = await POST(
      new Request("http://localhost/api/payments/payment-1/receipt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      { params: Promise.resolve({ paymentId: "payment-1" }) },
    );

    expect(response.status).toBe(401);
  });

  it("rejects a request with the wrong internal secret", async () => {
    const response = await POST(
      new Request("http://localhost/api/payments/payment-1/receipt", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-manclient-internal-secret": "wrong-secret",
        },
        body: "{}",
      }),
      { params: Promise.resolve({ paymentId: "payment-1" }) },
    );

    expect(response.status).toBe(401);
  });

  it("allows an authenticated request to reach payload validation", async () => {
    const response = await POST(
      new Request("http://localhost/api/payments/payment-1/receipt", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-manclient-internal-secret": "test-internal-secret",
        },
        body: "{}",
      }),
      { params: Promise.resolve({ paymentId: "payment-1" }) },
    );

    expect(response.status).toBe(422);
  });
});
