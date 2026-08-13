import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createBranch, updateBranch } from "@/core/business-settings/branch-service";
import { prisma } from "@/core/database/prisma";
import { registerBusiness } from "@/core/onboarding/register-business";
import { decryptCardNumber } from "@/core/payments/card-encryption";

/**
 * The card used to be writable exactly once, during onboarding, on the first branch. That was survivable
 * only while the step was mandatory: now a salon can leave onboarding without a card, and a second branch
 * never had one to begin with. Both need a way in, and neither may reach another tenant's branch.
 */
describe("branch recipient card", () => {
  const businessIds: string[] = [];
  const userIds: string[] = [];
  let businessId: string;
  let actorUserId: string;
  let mainBranchId: string;

  beforeEach(async () => {
    process.env.CARD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const suffix = randomUUID().replace(/\D/g, "").padEnd(8, "3").slice(0, 8);
    const registered = await registerBusiness({ ownerName: "Владелец", phone: `+9929${suffix}`, password: "safe-password", businessName: `Салон ${suffix}` });
    businessIds.push(registered.businessId);
    userIds.push(registered.userId);
    businessId = registered.businessId;
    actorUserId = registered.userId;
    mainBranchId = (await prisma.branch.findFirstOrThrow({ where: { businessId } })).id;
  });

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
    delete process.env.CARD_ENCRYPTION_KEY;
  });

  it("stores the card encrypted and keeps only four digits readable", async () => {
    await updateBranch({ businessId, actorUserId, branchId: mainBranchId, name: "Главный", address: "", phone: "", timeZone: "Asia/Dushanbe", recipientCard: "9762 0000 0000 1234" });

    const branch = await prisma.branch.findUniqueOrThrow({ where: { id: mainBranchId } });
    expect(branch.recipientCardLast4).toBe("1234");
    expect(branch.recipientCardEncrypted).not.toContain("9762");
    expect(decryptCardNumber(branch.recipientCardEncrypted ?? "", process.env.CARD_ENCRYPTION_KEY ?? "")).toBe("9762000000001234");
  });

  it("gives a second branch its own card instead of borrowing the first one's", async () => {
    await updateBranch({ businessId, actorUserId, branchId: mainBranchId, name: "Главный", address: "", phone: "", timeZone: "Asia/Dushanbe", recipientCard: "9762000000001111" });
    const second = await createBranch({ businessId, actorUserId, name: "Второй", address: "", phone: "", timeZone: "Asia/Dushanbe", recipientCard: "9762000000002222" });

    const branches = await prisma.branch.findMany({ where: { businessId }, orderBy: { createdAt: "asc" }, select: { recipientCardLast4: true } });
    expect(branches.map(branch => branch.recipientCardLast4)).toEqual(["1111", "2222"]);
  });

  it("leaves the stored card alone when the field comes back empty", async () => {
    await updateBranch({ businessId, actorUserId, branchId: mainBranchId, name: "Главный", address: "", phone: "", timeZone: "Asia/Dushanbe", recipientCard: "9762000000001234" });

    await updateBranch({ businessId, actorUserId, branchId: mainBranchId, name: "Переименован", address: "", phone: "", timeZone: "Asia/Dushanbe", recipientCard: "" });

    const branch = await prisma.branch.findUniqueOrThrow({ where: { id: mainBranchId } });
    expect(branch.name).toBe("Переименован");
    expect(branch.recipientCardLast4).toBe("1234");
  });

  it("refuses a card that is not sixteen digits and changes nothing", async () => {
    await expect(updateBranch({ businessId, actorUserId, branchId: mainBranchId, name: "Главный", address: "", phone: "", timeZone: "Asia/Dushanbe", recipientCard: "9762 0000" }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });

    const branch = await prisma.branch.findUniqueOrThrow({ where: { id: mainBranchId } });
    expect(branch.recipientCardEncrypted).toBeNull();
  });

  it("records only the last four digits in the audit trail", async () => {
    await updateBranch({ businessId, actorUserId, branchId: mainBranchId, name: "Главный", address: "", phone: "", timeZone: "Asia/Dushanbe", recipientCard: "9762000000004321" });

    const event = await prisma.auditEvent.findFirstOrThrow({ where: { businessId, type: "branch.updated" }, orderBy: { createdAt: "desc" } });
    expect(JSON.stringify(event.metadata)).toContain("4321");
    expect(JSON.stringify(event.metadata)).not.toContain("9762000000004321");
  });

  it("cannot write a card onto another tenant's branch", async () => {
    const other = await registerBusiness({ ownerName: "Другой", phone: "+992903334455", password: "safe-password", businessName: "Другой салон" });
    businessIds.push(other.businessId);
    userIds.push(other.userId);
    const otherBranchId = (await prisma.branch.findFirstOrThrow({ where: { businessId: other.businessId } })).id;

    await expect(updateBranch({ businessId, actorUserId, branchId: otherBranchId, name: "Чужой", address: "", phone: "", timeZone: "Asia/Dushanbe", recipientCard: "9762000000009999" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });

    const branch = await prisma.branch.findUniqueOrThrow({ where: { id: otherBranchId } });
    expect(branch.recipientCardEncrypted).toBeNull();
  });
});
