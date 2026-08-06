import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { authenticateWithThrottle } from "@/core/auth/login-throttle";
import { hashPassword } from "@/core/auth/password";
import { prisma } from "@/core/database/prisma";

/**
 * This rule was wrong once already, in the direction that matters: counting every attempt rather than
 * every failure locked out a whole office sharing one address, and the browser suite — twenty honest
 * logins as the same demo owner — was what surfaced it. What is pinned here is the corrected rule, in
 * both directions: a working password never costs anything, a wrong one always does.
 */
describe("login throttling", () => {
  const NOW = new Date("2026-08-05T09:00:00.000Z");

  it("does not spend the budget on successful logins", async () => {
    const { identifier, password } = await createOwner();
    const address = uniqueAddress();

    // Far past the ten-failure ceiling: a receptionist signing in all day must never be locked out.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await expect(authenticateWithThrottle({ identifier, password, address }, NOW)).resolves.toMatchObject({ name: "Владелец" });
    }
  });

  it("locks the account after ten wrong passwords and keeps the right one out too", async () => {
    const { identifier, password } = await createOwner();
    const address = uniqueAddress();

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(authenticateWithThrottle({ identifier, password: "wrong-password", address }, NOW)).resolves.toBeNull();
    }

    // The whole point: once the window is full, even the correct password is refused, so guessing it on
    // attempt eleven buys the attacker nothing.
    await expect(authenticateWithThrottle({ identifier, password, address }, NOW)).resolves.toBeNull();
  });

  it("locks one account without touching another on the same address", async () => {
    const address = uniqueAddress();
    const attacked = await createOwner();
    const colleague = await createOwner();

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await authenticateWithThrottle({ identifier: attacked.identifier, password: "wrong-password", address }, NOW);
    }

    await expect(authenticateWithThrottle({ identifier: attacked.identifier, password: attacked.password, address }, NOW)).resolves.toBeNull();
    await expect(
      authenticateWithThrottle({ identifier: colleague.identifier, password: colleague.password, address }, NOW),
    ).resolves.toMatchObject({ name: "Владелец" });
  });

  it("stops a script working through many accounts from one address", async () => {
    const address = uniqueAddress();
    const victim = await createOwner();

    // Sixty failures against sixty different numbers stay under every per-account limit and still have
    // to be stopped — that is what the address counter is for.
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await authenticateWithThrottle({ identifier: `+9929000${String(attempt).padStart(5, "0")}`, password: "wrong-password", address }, NOW);
    }

    await expect(authenticateWithThrottle({ identifier: victim.identifier, password: victim.password, address }, NOW)).resolves.toBeNull();
    // A different address is unaffected: the block belongs to the source, not to the account.
    await expect(
      authenticateWithThrottle({ identifier: victim.identifier, password: victim.password, address: uniqueAddress() }, NOW),
    ).resolves.toMatchObject({ name: "Владелец" });
  });

  it("forgets the failures once the window has passed", async () => {
    const { identifier, password } = await createOwner();
    const address = uniqueAddress();

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await authenticateWithThrottle({ identifier, password: "wrong-password", address }, NOW);
    }
    await expect(authenticateWithThrottle({ identifier, password, address }, NOW)).resolves.toBeNull();

    // Windows are fifteen minutes; a locked-out owner does not have to call support.
    const later = new Date(NOW.getTime() + 16 * 60_000);
    await expect(authenticateWithThrottle({ identifier, password, address }, later)).resolves.toMatchObject({ name: "Владелец" });
  });
});

async function createOwner() {
  const password = "correct-password-1";
  const phone = `+992902${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}`;
  await prisma.user.create({
    data: { phone, displayName: "Владелец", passwordHash: await hashPassword(password) },
  });
  return { identifier: phone, password };
}

function uniqueAddress(): string {
  return `203.0.113.${randomUUID()}`;
}
