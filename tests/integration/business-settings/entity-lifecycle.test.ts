import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createBranch, archiveBranch, restoreBranch, updateBranch } from "@/core/business-settings/branch-service";
import { createResource, archiveResource, restoreResource } from "@/core/business-settings/resource-service";
import { createService, archiveService, restoreService } from "@/core/business-settings/service-service";
import { createStaff, archiveStaff, restoreStaff } from "@/core/business-settings/staff-service";
import { prisma } from "@/core/database/prisma";
import { registerBusiness } from "@/core/onboarding/register-business";

describe("business settings entity lifecycle", () => {
  const businessIds: string[] = [];
  const userIds: string[] = [];
  let businessId: string;
  let actorUserId: string;
  let mainBranchId: string;

  beforeEach(async () => {
    const suffix = randomUUID().replace(/\D/g, "").padEnd(8, "7").slice(0, 8);
    const registered = await registerBusiness({
      ownerName: "Владелец",
      phone: `+9929${suffix}`,
      password: "safe-password",
      businessName: "Салон Сино",
    });
    businessId = registered.businessId;
    actorUserId = registered.userId;
    businessIds.push(businessId);
    userIds.push(actorUserId);
    mainBranchId = (await prisma.branch.findFirstOrThrow({ where: { businessId } })).id;
  });

  afterEach(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds.splice(0) } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  });

  it("creates, updates, archives and restores a branch inside the tenant", async () => {
    const created = await createBranch({
      businessId,
      actorUserId,
      name: "Филиал Сомони",
      address: "Сомони, 12",
      phone: "+992 90 111 22 33",
      timeZone: "Asia/Dushanbe",
    });

    await updateBranch({ businessId, actorUserId, branchId: created.id, name: "Сомони", address: "Сомони, 14", phone: "", timeZone: "Asia/Dushanbe" });
    await archiveBranch({ businessId, actorUserId, branchId: created.id });
    expect(await prisma.branch.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ name: "Сомони", archivedAt: expect.any(Date) });

    await restoreBranch({ businessId, actorUserId, branchId: created.id });
    expect((await prisma.branch.findUniqueOrThrow({ where: { id: created.id } })).archivedAt).toBeNull();
  });

  it("rejects cross-tenant mutations and staff actors", async () => {
    const other = await registerBusiness({ ownerName: "Другой", phone: "+992901234567", password: "safe-password", businessName: "Другой бизнес" });
    businessIds.push(other.businessId);
    userIds.push(other.userId);

    await expect(updateBranch({ businessId: other.businessId, actorUserId, branchId: mainBranchId, name: "Чужой", address: "", phone: "", timeZone: "Asia/Dushanbe" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const staffUser = await prisma.user.create({ data: { phone: "+992907654321", displayName: "Сотрудник" } });
    userIds.push(staffUser.id);
    await prisma.membership.create({ data: { businessId, userId: staffUser.id, role: "STAFF" } });
    await expect(createBranch({ businessId, actorUserId: staffUser.id, name: "Нельзя", address: "", phone: "", timeZone: "Asia/Dushanbe" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("manages a specialist independently from dashboard access", async () => {
    const secondBranch = await createBranch({ businessId, actorUserId, name: "Сино", address: "", phone: "", timeZone: "Asia/Dushanbe" });
    const staff = await createStaff({
      businessId,
      actorUserId,
      displayName: "Манижа Саидова",
      phone: "+992 90 123 45 67",
      branchIds: [mainBranchId, secondBranch.id],
      primaryBranchId: mainBranchId,
      serviceIds: [],
    });

    const stored = await prisma.staffMember.findUniqueOrThrow({ where: { id: staff.id }, include: { branches: true } });
    expect(stored.membershipId).toBeNull();
    expect(stored.branches).toHaveLength(2);
    expect(stored.branches.find(item => item.isPrimary)?.branchId).toBe(mainBranchId);

    await archiveStaff({ businessId, actorUserId, staffId: staff.id });
    await restoreStaff({ businessId, actorUserId, staffId: staff.id });
    expect((await prisma.staffMember.findUniqueOrThrow({ where: { id: staff.id } })).archivedAt).toBeNull();
  });

  it("creates and restores linked resources and published services", async () => {
    const ownerStaff = await prisma.staffMember.findFirstOrThrow({ where: { businessId, membership: { userId: actorUserId } } });
    const resource = await createResource({ businessId, actorUserId, branchId: mainBranchId, name: "Подъёмник 1", kind: "LIFT", capacity: "1", isAvailable: true, serviceIds: [] });
    const service = await createService({
      businessId,
      actorUserId,
      branchId: mainBranchId,
      name: "Замена масла",
      description: "Масло и фильтр",
      durationMinutes: "45",
      amountSomoni: "120",
      staffIds: [ownerStaff.id],
      resourceIds: [resource.id],
      isPublished: true,
    });

    const stored = await prisma.service.findUniqueOrThrow({ where: { id: service.id }, include: { staffMembers: true, resources: true } });
    expect(stored).toMatchObject({ amountDiram: 12_000, isPublished: true });
    expect(stored.staffMembers).toHaveLength(1);
    expect(stored.resources).toHaveLength(1);

    await archiveService({ businessId, actorUserId, serviceId: service.id });
    await restoreService({ businessId, actorUserId, serviceId: service.id });
    await archiveResource({ businessId, actorUserId, resourceId: resource.id });
    await restoreResource({ businessId, actorUserId, resourceId: resource.id });
    expect((await prisma.service.findUniqueOrThrow({ where: { id: service.id } })).archivedAt).toBeNull();
    expect((await prisma.resource.findUniqueOrThrow({ where: { id: resource.id } })).archivedAt).toBeNull();
  });
});
