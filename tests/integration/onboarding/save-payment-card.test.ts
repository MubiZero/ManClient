import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/core/database/prisma";
import { OnboardingStepError } from "@/core/onboarding/onboarding-step-error";
import { registerBusiness } from "@/core/onboarding/register-business";
import { savePaymentCard } from "@/core/onboarding/save-payment-card";

describe("savePaymentCard", () => {
  const businessIds: string[] = [];
  const userIds: string[] = [];

  async function register() {
    const digits = randomUUID().replace(/\D/g, "").padEnd(8, "5").slice(0, 8);
    const result = await registerBusiness({
      ownerName: "Владелец",
      phone: `+9929${digits}`,
      password: "12345678",
      businessName: `Бизнес ${digits}`,
    });
    businessIds.push(result.businessId);
    userIds.push(result.userId);
    return result;
  }

  beforeEach(() => {
    process.env.CARD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
    delete process.env.CARD_ENCRYPTION_KEY;
  });

  // The number here is deliberately synthetic — a real DushanbeCity prefix with an empty body. A
  // working card number in a fixture is a working card number in the repository, and this one used to
  // be the platform's own.
  it("encrypts the card on the tenant main branch and exposes only its last four digits", async () => {
    const registered = await register();

    await savePaymentCard({
      businessId: registered.businessId,
      actorUserId: registered.userId,
      recipientCard: "9762 0000 0000 0000",
    });

    const branch = await prisma.branch.findFirstOrThrow({ where: { businessId: registered.businessId } });
    expect(branch.recipientCardLast4).toBe("0000");
    expect(branch.recipientCardEncrypted).toBeTruthy();
    expect(branch.recipientCardEncrypted).not.toContain("9762000000000000");
  });

  it("cannot update a branch owned by another tenant", async () => {
    const first = await register();
    const second = await register();

    await expect(savePaymentCard({
      businessId: second.businessId,
      actorUserId: first.userId,
      recipientCard: "9762000000000000",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const secondBranch = await prisma.branch.findFirstOrThrow({ where: { businessId: second.businessId } });
    expect(secondBranch.recipientCardEncrypted).toBeNull();
  });

  it("reports missing encryption configuration", async () => {
    const registered = await register();
    delete process.env.CARD_ENCRYPTION_KEY;

    await expect(savePaymentCard({
      businessId: registered.businessId,
      actorUserId: registered.userId,
      recipientCard: "9762000000000000",
    })).rejects.toBeInstanceOf(OnboardingStepError);
  });
});
