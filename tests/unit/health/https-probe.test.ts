import { describe, expect, it } from "vitest";

import { probeDeployment, type ProbeDependencies } from "@/core/observability/https-probe";

const now = new Date("2026-08-13T12:00:00.000Z");

describe("post-deploy HTTPS probe", () => {
  it("passes a healthy deployment with every secret in place", async () => {
    const checks = await probeDeployment("https://manclient.example", dependencies());

    expect(checks.filter(check => !check.ok)).toEqual([]);
    expect(checks.map(check => check.name)).toEqual([
      "https",
      "certificate",
      "no plaintext",
      "health",
      "legacy webhook gone",
      "telegram webhook secret set",
      "whatsapp verify token set",
    ]);
  });

  it("refuses to certify a target that is not https at all", async () => {
    const checks = await probeDeployment("http://manclient.example", dependencies());

    expect(checks).toEqual([{ name: "https", ok: false, detail: "probe target must be https, got http://" }]);
  });

  it("fails while the certificate is close to expiry, before anyone's browser says so", async () => {
    const soon = await probeDeployment("https://manclient.example", dependencies({ validTo: new Date("2026-08-22T12:00:00.000Z") }));
    const expired = await probeDeployment("https://manclient.example", dependencies({ validTo: new Date("2026-08-11T12:00:00.000Z") }));

    expect(soon.find(check => check.name === "certificate")).toEqual({ name: "certificate", ok: false, detail: "expires in 9 day(s) — renewal is not running" });
    expect(expired.find(check => check.name === "certificate")).toEqual({ name: "certificate", ok: false, detail: "expired 2 day(s) ago" });
  });

  it("fails when the TLS handshake never completes", async () => {
    const checks = await probeDeployment("https://manclient.example", dependencies({ certificateError: new Error("ECONNREFUSED") }));

    expect(checks.find(check => check.name === "certificate")).toEqual({ name: "certificate", ok: false, detail: "TLS handshake failed: ECONNREFUSED" });
  });

  it("accepts a closed port 80 but not one that serves the app in the clear", async () => {
    const closed = await probeDeployment("https://manclient.example", dependencies({ plaintext: "refused" }));
    const serving = await probeDeployment("https://manclient.example", dependencies({ plaintext: "serves" }));

    expect(closed.find(check => check.name === "no plaintext")?.ok).toBe(true);
    expect(serving.find(check => check.name === "no plaintext")).toEqual({
      name: "no plaintext",
      ok: false,
      detail: "port 80 answered 200 instead of redirecting to https",
    });
  });

  it("fails health when the app answers but the database behind it does not", async () => {
    const checks = await probeDeployment("https://manclient.example", dependencies({ health: { status: 503, body: '{"status":"unavailable"}' } }));

    expect(checks.find(check => check.name === "health")).toEqual({ name: "health", ok: false, detail: "expected HTTP 200, got 503" });
  });

  it("catches a webhook secret that was never added to the deployed environment", async () => {
    const checks = await probeDeployment("https://manclient.example", dependencies({ telegramPlatformStatus: 200, whatsappVerifyStatus: 200 }));

    expect(checks.find(check => check.name === "telegram webhook secret set")).toEqual({
      name: "telegram webhook secret set",
      ok: false,
      detail: "expected HTTP 401, got 200",
    });
    expect(checks.find(check => check.name === "whatsapp verify token set")).toEqual({
      name: "whatsapp verify token set",
      ok: false,
      detail: "expected HTTP 403, got 200",
    });
  });

  it("catches a legacy webhook that is still answering after the cutover", async () => {
    const checks = await probeDeployment("https://manclient.example", dependencies({ legacyStatus: 200 }));

    expect(checks.find(check => check.name === "legacy webhook gone")).toEqual({
      name: "legacy webhook gone",
      ok: false,
      detail: "expected HTTP 410, got 200",
    });
  });
});

type Overrides = {
  validTo?: Date;
  certificateError?: Error;
  plaintext?: "redirects" | "refused" | "serves";
  health?: { status: number; body: string };
  legacyStatus?: number;
  telegramPlatformStatus?: number;
  whatsappVerifyStatus?: number;
};

function dependencies(overrides: Overrides = {}): ProbeDependencies {
  const health = overrides.health ?? { status: 200, body: '{"status":"ok"}' };
  return {
    now: () => now,
    peerCertificate: async () => {
      if (overrides.certificateError) throw overrides.certificateError;
      return { validTo: overrides.validTo ?? new Date("2026-10-01T12:00:00.000Z"), host: "manclient.example" };
    },
    fetch: (async (input: string) => {
      const url = new URL(input);
      if (url.protocol === "http:") {
        if ((overrides.plaintext ?? "redirects") === "refused") throw new Error("ECONNREFUSED");
        if (overrides.plaintext === "serves") return new Response("{}", { status: 200 });
        return new Response(null, { status: 308, headers: { location: `https://${url.host}${url.pathname}` } });
      }
      if (url.pathname === "/api/health") return new Response(health.body, { status: health.status });
      if (url.pathname === "/api/webhooks/telegram") return new Response("{}", { status: overrides.legacyStatus ?? 410 });
      if (url.pathname === "/api/webhooks/telegram/platform") return new Response("{}", { status: overrides.telegramPlatformStatus ?? 401 });
      if (url.pathname === "/api/webhooks/whatsapp") return new Response("challenge", { status: overrides.whatsappVerifyStatus ?? 403 });
      throw new Error(`unexpected probe request: ${input}`);
    }) as typeof globalThis.fetch,
  };
}
