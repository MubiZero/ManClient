import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { authenticateCredentials } from "@/core/auth/credential-identity";
import { hashPassword } from "@/core/auth/password";
import { prisma } from "@/core/database/prisma";

describe("credential identity", () => {
  const userIds: string[] = [];
  afterEach(async () => prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } }));

  it("authenticates new users by phone and keeps legacy email login", async () => {
    const suffix = randomUUID();
    const passwordHash = await hashPassword("safe-password-123");
    const phoneUser = await prisma.user.create({ data: { phone: "+992901234567", displayName: "Phone Owner", passwordHash } });
    const emailUser = await prisma.user.create({ data: { email: `legacy-${suffix}@example.test`, displayName: "Legacy Owner", passwordHash } });
    userIds.push(phoneUser.id, emailUser.id);

    await expect(authenticateCredentials("+992 90 123 45 67", "safe-password-123")).resolves.toMatchObject({ id: phoneUser.id });
    await expect(authenticateCredentials(emailUser.email!, "safe-password-123")).resolves.toMatchObject({ id: emailUser.id });
  });
});
