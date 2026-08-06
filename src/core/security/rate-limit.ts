import { createHash } from "node:crypto";

import { prisma } from "@/core/database/prisma";
import { logger } from "@/core/observability/logger";

/**
 * Fixed-window counters keyed by (scope, subject). Fixed windows let a caller send 2× the limit
 * across a window boundary, which is the accepted trade for a limiter that costs one upsert and needs
 * no background state — the point here is stopping scripted abuse, not shaping traffic to the request.
 *
 * Subjects are hashed: the counter table would otherwise become a log of which phone numbers tried to
 * book where, and it is never read for anything but a count.
 */

export type RateLimitScope =
  | "booking.create"
  | "booking.recurring"
  | "waitlist.join"
  | "promo.validate"
  | "phone.request"
  | "phone.verify"
  | "auth.login"
  | "auth.login_ip"
  | "auth.register"
  | "auth.password_reset"
  | "receipt.upload";

type RateLimitRule = { limit: number; windowMs: number };

/**
 * Deliberately generous per window: a receptionist rebooking a walk-in queue from one office IP must
 * never hit these. They exist to stop a script, not a busy morning.
 */
const RULES: Record<RateLimitScope, RateLimitRule> = {
  "booking.create": { limit: 12, windowMs: 10 * 60_000 },
  "booking.recurring": { limit: 6, windowMs: 10 * 60_000 },
  "waitlist.join": { limit: 10, windowMs: 10 * 60_000 },
  "promo.validate": { limit: 30, windowMs: 10 * 60_000 },
  "phone.request": { limit: 5, windowMs: 60 * 60_000 },
  "phone.verify": { limit: 15, windowMs: 60 * 60_000 },
  // Per account: the brute-force guard, and deliberately tight.
  "auth.login": { limit: 10, windowMs: 15 * 60_000 },
  // Per address: far looser, because one address is not one person. A salon behind a single NAT has its
  // owner, two admins and a receptionist logging in from it, and a shared limit of ten locked them all
  // out together — the e2e suite hit exactly this from one IP.
  "auth.login_ip": { limit: 60, windowMs: 15 * 60_000 },
  "auth.register": { limit: 5, windowMs: 60 * 60_000 },
  "auth.password_reset": { limit: 5, windowMs: 60 * 60_000 },
  "receipt.upload": { limit: 20, windowMs: 10 * 60_000 },
};

export class RateLimitedError extends Error {
  constructor(
    public readonly scope: RateLimitScope,
    public readonly retryAfterSeconds: number,
  ) {
    super(`Rate limit exceeded for ${scope}`);
    this.name = "RateLimitedError";
  }
}

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

function hashSubject(subject: string): string {
  return createHash("sha256").update(subject.trim().toLowerCase()).digest("hex").slice(0, 32);
}

export async function consumeRateLimit(scope: RateLimitScope, subject: string, now = new Date()): Promise<RateLimitResult> {
  const rule = RULES[scope];
  const windowStartsAt = new Date(Math.floor(now.getTime() / rule.windowMs) * rule.windowMs);
  const expiresAt = new Date(windowStartsAt.getTime() + rule.windowMs);
  const retryAfterSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));

  try {
    const counter = await prisma.rateLimitCounter.upsert({
      where: { scope_subject_windowStartsAt: { scope, subject: hashSubject(subject), windowStartsAt } },
      create: { scope, subject: hashSubject(subject), windowStartsAt, count: 1, expiresAt },
      update: { count: { increment: 1 } },
    });

    return { allowed: counter.count <= rule.limit, remaining: Math.max(0, rule.limit - counter.count), retryAfterSeconds };
  } catch (error) {
    // Fails open, and says so loudly. A database hiccup must not stop customers booking, but a
    // limiter that is quietly not limiting is exactly the state worth an alert.
    logger.error("rate_limit.unavailable", { scope, error: error instanceof Error ? error.message : String(error) });
    return { allowed: true, remaining: rule.limit, retryAfterSeconds };
  }
}

/**
 * Reads the counter without spending one. Login uses this together with `recordRateLimitFailure` so
 * that only *failed* attempts count: a receptionist signing in correctly ten times in an afternoon is
 * not the thing this limit exists to stop, and charging them for it locks out the whole business.
 */
export async function isRateLimited(scope: RateLimitScope, subject: string, now = new Date()): Promise<boolean> {
  const rule = RULES[scope];
  const windowStartsAt = new Date(Math.floor(now.getTime() / rule.windowMs) * rule.windowMs);
  try {
    const counter = await prisma.rateLimitCounter.findUnique({
      where: { scope_subject_windowStartsAt: { scope, subject: hashSubject(subject), windowStartsAt } },
      select: { count: true },
    });
    return (counter?.count ?? 0) >= rule.limit;
  } catch (error) {
    logger.error("rate_limit.unavailable", { scope, error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

/** Charges one attempt against the window. Named for its only caller's intent: a failure happened. */
export async function recordRateLimitFailure(scope: RateLimitScope, subject: string, now = new Date()): Promise<void> {
  await consumeRateLimit(scope, subject, now);
}

export async function assertRateLimit(scope: RateLimitScope, subject: string, now = new Date()): Promise<void> {
  const result = await consumeRateLimit(scope, subject, now);
  if (!result.allowed) throw new RateLimitedError(scope, result.retryAfterSeconds);
}

/**
 * `x-forwarded-for` is appended to by every hop, so the client is the first entry — and it is only
 * trustworthy because the app is never exposed directly, always through the reverse proxy that sets
 * it. A missing header collapses everyone into one bucket named `unknown`, which throttles harder
 * rather than not at all.
 */
export function clientIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function rateLimitedResponse(error: RateLimitedError): Response {
  return Response.json(
    { error: "RATE_LIMITED", retryAfterSeconds: error.retryAfterSeconds },
    { status: 429, headers: { "retry-after": String(error.retryAfterSeconds) } },
  );
}

/** Drops windows that have closed. Called from the expiry job; nothing reads expired rows. */
export async function deleteExpiredRateLimitCounters(now = new Date()): Promise<number> {
  const result = await prisma.rateLimitCounter.deleteMany({ where: { expiresAt: { lte: now } } });
  return result.count;
}
