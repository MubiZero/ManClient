import { timingSafeEqual } from "node:crypto";

export function matchesWebhookSecret(expected: string | undefined, provided: string | null) {
  if (!expected || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}
