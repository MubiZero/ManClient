import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The gate in front of every inbound webhook. Two providers, two mechanisms: Telegram echoes back a
 * shared secret in a header, Meta signs the raw body. Both live here so that the one rule they have in
 * common is written once — a missing secret closes the door, it does not open it. An unset env var is
 * the normal state of a half-configured deploy, and it must not be the state in which anybody who can
 * find the URL can post updates into a salon's chat.
 */

/** Telegram: `X-Telegram-Bot-Api-Secret-Token` must equal the secret we registered with `setWebhook`. */
export function matchesWebhookSecret(expected: string | undefined | null, provided: string | null) {
  if (!expected || !provided) return false;
  return equalInConstantTime(Buffer.from(expected), Buffer.from(provided));
}

/**
 * Meta: `X-Hub-Signature-256: sha256=<hex>` over the exact bytes of the body. The body must be the raw
 * text as received — re-serializing the parsed JSON changes whitespace and key order, and the signature
 * stops matching for reasons that look like an attack.
 */
export function matchesHmacSignature(input: { body: string; secret: string | undefined | null; header: string | null }) {
  const { body, secret, header } = input;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(body).digest("hex"));
  return equalInConstantTime(expected, Buffer.from(header.slice("sha256=".length)));
}

/**
 * `timingSafeEqual` throws on a length mismatch, so the lengths are compared first — which leaks the
 * length of the secret and nothing else. What it protects is the byte-by-byte comparison, where a naive
 * `===` would return early on the first wrong character and let a caller guess a secret one character at
 * a time.
 */
function equalInConstantTime(expected: Buffer, provided: Buffer) {
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
