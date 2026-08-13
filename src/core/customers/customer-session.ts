import { cookies } from "next/headers";

import {
  createCustomerSessionToken,
  CUSTOMER_SESSION_DAYS,
  verifyCustomerSessionToken,
} from "@/core/customers/customer-session-token";

/**
 * The cookie side of a customer session. Kept apart from the token itself so that the signing rules
 * can be tested without a request, and so that anything running outside a request (a job, the
 * Telegram bot) cannot accidentally reach for a browser cookie.
 */

export const CUSTOMER_SESSION_COOKIE = "manclient-customer";

/** The signed-in phone number, or null for a visitor with no cookie, a stale one, or a forged one. */
export async function readCustomerPhone(now = new Date()): Promise<string | null> {
  // Also null when there is no request at all. A booking created by a job, by the Telegram bot or by
  // a test that calls the route handler directly has no browser behind it, and "nobody is signed in"
  // is the correct answer there rather than a crash on the way to creating the booking.
  let token: string | undefined;
  try {
    token = (await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value;
  } catch {
    return null;
  }
  if (!token) return null;
  return verifyCustomerSessionToken(token, now)?.phone ?? null;
}

export async function startCustomerSession(phone: string, now = new Date()): Promise<void> {
  const expiresAt = new Date(now.getTime() + CUSTOMER_SESSION_DAYS * 24 * 60 * 60_000);
  (await cookies()).set(CUSTOMER_SESSION_COOKIE, createCustomerSessionToken({ phone, expiresAt }), {
    httpOnly: true,
    sameSite: "lax",
    // Not "always secure": the public pages are served over http in local development, and a cookie
    // the developer's browser silently drops is a bug that only shows up as "login does nothing".
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function endCustomerSession(): Promise<void> {
  (await cookies()).delete(CUSTOMER_SESSION_COOKIE);
}
