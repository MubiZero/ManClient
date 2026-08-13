import { createHmac, timingSafeEqual } from "node:crypto";

import { normalizeTajikPhone } from "@/core/formatting/tajik-phone";

/**
 * What a signed-in customer carries in their browser.
 *
 * The identity is the phone number and nothing else. A customer is not one row in this product — the
 * same person is a separate `Customer` in every salon they have ever visited — so a session that
 * pointed at a row would only ever show one salon's half of their life. The number is what those rows
 * have in common, and it is also the only thing the customer knows about themselves here.
 *
 * The token is signed rather than stored. There is no server-side session table to sweep, a stolen
 * cookie dies with its own expiry, and rotating `AUTH_SECRET` signs everybody out — which is the
 * behaviour we would want from a revocation switch anyway.
 */

/** Two months: long enough that a customer booking every few weeks never signs in twice. */
export const CUSTOMER_SESSION_DAYS = 60;

export type CustomerSession = { phone: string; expiresAt: Date };

export function createCustomerSessionToken(input: CustomerSession): string {
  const phone = normalizeTajikPhone(input.phone);
  if (!phone) throw new Error("A customer session needs a valid phone number");
  const expiresAt = Math.floor(input.expiresAt.getTime() / 1000).toString(36);
  const payload = `${phone}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Null rather than an exception for anything wrong with the token: an expired or tampered cookie is
 * an ordinary fact of the open web, and every caller's answer to it is the same — treat the visitor
 * as signed out.
 */
export function verifyCustomerSessionToken(token: string, now = new Date()): CustomerSession | null {
  const [phoneValue, expiresAtValue, signature] = token.split(".");
  if (!phoneValue || !expiresAtValue || !signature) return null;

  const payload = `${phoneValue}.${expiresAtValue}`;
  if (!matchesSignature(payload, signature)) return null;

  const expiresAt = new Date(Number.parseInt(expiresAtValue, 36) * 1000);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) return null;

  // Normalised again on the way out: the signature only proves we wrote the string, not that the
  // format we wrote a year ago is the one the rest of the code compares against today.
  const phone = normalizeTajikPhone(phoneValue);
  return phone ? { phone, expiresAt } : null;
}

function sign(payload: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters");
  return createHmac("sha256", secret).update(`customer-session:${payload}`).digest().subarray(0, 16).toString("base64url");
}

function matchesSignature(payload: string, signature: string): boolean {
  const expected = Buffer.from(sign(payload));
  const provided = Buffer.from(signature);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
