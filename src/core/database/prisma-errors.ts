/**
 * Prisma reports a unique-constraint violation as error code P2002. Several call sites treat that
 * as a normal outcome rather than a fault — two concurrent requests racing to create the same row,
 * or a second review submitted for one booking — so the check is shared here instead of being
 * re-derived, slightly differently, in every domain that needs it.
 */
export function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
