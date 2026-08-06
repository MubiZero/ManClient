import { timingSafeEqual } from "node:crypto";

/**
 * Guards the endpoints only the platform's own processes call — receipt confirmation and the metrics
 * scrape. Compared in constant time and length-checked first, because `timingSafeEqual` throws on a
 * length mismatch rather than returning false.
 */
export function hasValidInternalSecret(request: Request): boolean {
  const expected = process.env.INTERNAL_API_SECRET;
  const provided = request.headers.get("x-manclient-internal-secret");
  if (!expected || !provided) return false;

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}
