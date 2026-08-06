import { authenticateCredentials } from "@/core/auth/credential-identity";
import { logger } from "@/core/observability/logger";
import { isRateLimited, recordRateLimitFailure } from "@/core/security/rate-limit";

/**
 * Brute-force protection for the credentials login, kept out of the NextAuth provider so it can be
 * tested without booting the auth stack — the rule it encodes is subtle enough to deserve that.
 *
 * Only *failed* attempts are charged. Counting every attempt is the obvious implementation and the
 * wrong one: a salon's staff share one office address, and a receptionist who signs in correctly four
 * times a day would spend the whole building's budget. An attacker guessing passwords, by definition,
 * fails every time — so failures alone are enough signal.
 *
 * Two independent counters, with very different ceilings: the per-account one is the actual guard, the
 * per-address one only has to stop a script from working through a list of numbers.
 */

export const LOGIN_IDENTIFIER_SCOPE = "auth.login" as const;
export const LOGIN_ADDRESS_SCOPE = "auth.login_ip" as const;

export type LoginThrottleDependencies = {
  authenticate: typeof authenticateCredentials;
};

const defaultDependencies: LoginThrottleDependencies = { authenticate: authenticateCredentials };

export async function authenticateWithThrottle(
  input: { identifier: string; password: string; address: string },
  now = new Date(),
  dependencies: LoginThrottleDependencies = defaultDependencies,
): Promise<Awaited<ReturnType<typeof authenticateCredentials>>> {
  const identifierSubject = `identifier:${input.identifier}`;
  const addressSubject = `ip:${input.address}`;

  const [identifierBlocked, addressBlocked] = await Promise.all([
    isRateLimited(LOGIN_IDENTIFIER_SCOPE, identifierSubject, now),
    isRateLimited(LOGIN_ADDRESS_SCOPE, addressSubject, now),
  ]);
  if (identifierBlocked || addressBlocked) {
    // Returned as a plain failure: the response must not tell an attacker whether they hit a wrong
    // password or a wall, or which of the two walls it was.
    logger.warn("auth.login_throttled", { identifier: input.identifier, scope: identifierBlocked ? "identifier" : "address" });
    return null;
  }

  const user = await dependencies.authenticate(input.identifier, input.password);
  if (!user) {
    await Promise.all([
      recordRateLimitFailure(LOGIN_IDENTIFIER_SCOPE, identifierSubject, now),
      recordRateLimitFailure(LOGIN_ADDRESS_SCOPE, addressSubject, now),
    ]);
  }
  return user;
}
