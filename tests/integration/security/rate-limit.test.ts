import { describe, expect, it } from "vitest";

import { prisma } from "@/core/database/prisma";
import {
  assertRateLimit,
  clientIdentifier,
  consumeRateLimit,
  deleteExpiredRateLimitCounters,
  isRateLimited,
  RateLimitedError,
  recordRateLimitFailure,
} from "@/core/security/rate-limit";

/**
 * The limiter is the only thing standing between the public booking endpoint and a script, so what is
 * pinned here is the behaviour that makes it useful: counting per subject, resetting on a new window,
 * and never storing the subject in a readable form.
 */
describe("rate limiting", () => {
  it("allows up to the limit and refuses the request after it", async () => {
    const subject = `ip:${crypto.randomUUID()}`;
    const now = new Date("2026-08-04T10:00:00.000Z");

    for (let attempt = 0; attempt < 12; attempt += 1) {
      await expect(assertRateLimit("booking.create", subject, now)).resolves.toBeUndefined();
    }

    await expect(assertRateLimit("booking.create", subject, now)).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("counts each subject separately", async () => {
    const now = new Date("2026-08-04T10:00:00.000Z");
    const first = `ip:${crypto.randomUUID()}`;
    const second = `ip:${crypto.randomUUID()}`;

    for (let attempt = 0; attempt < 12; attempt += 1) await consumeRateLimit("booking.create", first, now);

    await expect(consumeRateLimit("booking.create", first, now)).resolves.toMatchObject({ allowed: false });
    await expect(consumeRateLimit("booking.create", second, now)).resolves.toMatchObject({ allowed: true });
  });

  it("starts a fresh window once the old one closes", async () => {
    const subject = `phone:${crypto.randomUUID()}`;
    const inside = new Date("2026-08-04T10:00:00.000Z");
    // "auth.register" allows five per hour, so the next hour is a different window.
    for (let attempt = 0; attempt < 5; attempt += 1) await consumeRateLimit("auth.register", subject, inside);
    await expect(consumeRateLimit("auth.register", subject, inside)).resolves.toMatchObject({ allowed: false });

    await expect(consumeRateLimit("auth.register", subject, new Date("2026-08-04T11:00:00.000Z"))).resolves.toMatchObject({
      allowed: true,
    });
  });

  it("stores the subject hashed, so the table is not a log of who tried to book", async () => {
    const phone = "+992900007788";
    const now = new Date("2026-08-04T12:00:00.000Z");
    await consumeRateLimit("booking.create", `phone:${phone}`, now);

    const subjects = await prisma.rateLimitCounter.findMany({ where: { scope: "booking.create" }, select: { subject: true } });
    expect(subjects.some((row) => row.subject.includes("992900007788"))).toBe(false);
  });

  it("drops counters whose window has closed", async () => {
    const now = new Date("2026-08-04T13:00:00.000Z");
    await consumeRateLimit("promo.validate", `ip:${crypto.randomUUID()}`, now);

    const removed = await deleteExpiredRateLimitCounters(new Date("2026-08-04T23:00:00.000Z"));
    expect(removed).toBeGreaterThan(0);
  });

  it("reports a blocked window without spending an attempt", async () => {
    const subject = `identifier:${crypto.randomUUID()}`;
    const now = new Date("2026-08-04T14:00:00.000Z");

    // Ten failures fill the login window; peeking at it must not be what pushes it over.
    for (let attempt = 0; attempt < 9; attempt += 1) await recordRateLimitFailure("auth.login", subject, now);
    expect(await isRateLimited("auth.login", subject, now)).toBe(false);
    expect(await isRateLimited("auth.login", subject, now)).toBe(false);

    await recordRateLimitFailure("auth.login", subject, now);
    expect(await isRateLimited("auth.login", subject, now)).toBe(true);
  });

  it("reads the client address from the proxy header and falls back to one shared bucket", () => {
    const forwarded = new Request("https://manclient.tj/api/bookings", { headers: { "x-forwarded-for": "88.99.1.2, 10.0.0.1" } });
    expect(clientIdentifier(forwarded)).toBe("88.99.1.2");
    expect(clientIdentifier(new Request("https://manclient.tj/api/bookings"))).toBe("unknown");
  });
});
