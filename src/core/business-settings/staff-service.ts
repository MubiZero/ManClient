import { commissionPercentSchema, staffInputSchema } from "@/core/business-settings/setting-schemas";
import { requireSettingsAccess } from "@/core/business-settings/authorize-settings";
import { SettingsError } from "@/core/business-settings/settings-error";
import { prisma } from "@/core/database/prisma";
import { publishFirstServiceWhenReady } from "@/core/onboarding/publish-first-service";
import { writeAuditEvent } from "@/core/audit/audit-service";
import { SUBSCRIPTION_SELECT, businessHasFeature } from "@/core/platform/subscription-plans";

// `commissionPercent` is gated by the STAFF_COMMISSIONS plan feature: businesses without the
// feature have any submitted value silently dropped to `null` server-side (not a hard
// PLAN_REQUIRED throw), matching how the form hides the field entirely for those plans.

type StaffInput = {
  businessId: string;
  actorUserId: string;
  displayName: string;
  phone?: string;
  branchIds: string[];
  primaryBranchId: string;
  serviceIds: string[];
  commissionPercent?: number | string | null;
};

export function createStaff(input: StaffInput) { return saveStaff(input); }
export function updateStaff(input: StaffInput & { staffId: string }) { return saveStaff(input); }

async function saveStaff(input: StaffInput & { staffId?: string }) {
  const parsed = staffInputSchema.safeParse({ displayName: input.displayName, phone: input.phone, branchIds: input.branchIds, primaryBranchId: input.primaryBranchId, serviceIds: input.serviceIds });
  if (!parsed.success) throw new SettingsError("INVALID_INPUT");
  const value = parsed.data;
  const commissionParsed = commissionPercentSchema.safeParse(input.commissionPercent ?? null);
  if (!commissionParsed.success) throw new SettingsError("INVALID_INPUT");
  const result = await prisma.$transaction(async transaction => {
    await requireSettingsAccess(transaction, input);
    const business = await transaction.business.findUniqueOrThrow({ where: { id: input.businessId }, select: SUBSCRIPTION_SELECT });
    const commissionPercent = businessHasFeature(business, "STAFF_COMMISSIONS") ? commissionParsed.data ?? null : null;
    const branchCount = await transaction.branch.count({ where: { id: { in: value.branchIds }, businessId: input.businessId, archivedAt: null } });
    const services = await transaction.service.findMany({ where: { id: { in: value.serviceIds }, branch: { businessId: input.businessId }, archivedAt: null }, select: { id: true, branchId: true } });
    if (branchCount !== value.branchIds.length || services.length !== value.serviceIds.length || services.some(service => !value.branchIds.includes(service.branchId))) throw new SettingsError("INVALID_INPUT");

    let staffId = input.staffId;
    if (staffId) {
      const result = await transaction.staffMember.updateMany({ where: { id: staffId, businessId: input.businessId }, data: { displayName: value.displayName, phone: value.phone, commissionPercent } });
      if (result.count !== 1) throw new SettingsError("NOT_FOUND");
      await transaction.staffBranch.deleteMany({ where: { staffId } });
      await transaction.staffMember.update({ where: { id: staffId }, data: { services: { set: value.serviceIds.map(id => ({ id })) } } });
    } else {
      const staff = await transaction.staffMember.create({ data: { businessId: input.businessId, displayName: value.displayName, phone: value.phone, commissionPercent, services: { connect: value.serviceIds.map(id => ({ id })) } }, select: { id: true } });
      staffId = staff.id;
    }
    await transaction.staffBranch.createMany({ data: value.branchIds.map(branchId => ({ staffId: staffId!, branchId, isPrimary: branchId === value.primaryBranchId })) });
    await writeAuditEvent({ businessId: input.businessId, type: input.staffId ? "staff.updated" : "staff.created", actorType: "USER", actorId: input.actorUserId, metadata: { staffId } }, transaction);
    return { id: staffId };
  });
  // The other half of what onboarding's first service waits on: a specialist to work it. Assigning one
  // here is the same decision the wizard would have made, so the service stops hiding at the same time.
  await publishFirstServiceWhenReady(input.businessId);
  return result;
}

export function archiveStaff(input: { businessId: string; actorUserId: string; staffId: string }) { return setArchived(input, true); }
export function restoreStaff(input: { businessId: string; actorUserId: string; staffId: string }) { return setArchived(input, false); }

async function setArchived(input: { businessId: string; actorUserId: string; staffId: string }, archived: boolean) {
  return prisma.$transaction(async transaction => {
    await requireSettingsAccess(transaction, input);
    const staff = await transaction.staffMember.findFirst({ where: { id: input.staffId, businessId: input.businessId }, select: { id: true } });
    if (!staff) throw new SettingsError("NOT_FOUND");
    if (archived) {
      const count = await transaction.booking.count({ where: { staffId: input.staffId, startsAt: { gte: new Date() }, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } } });
      if (count) throw new SettingsError("FUTURE_BOOKINGS", { count });
    }
    const result = await transaction.staffMember.update({ where: { id: input.staffId }, data: { archivedAt: archived ? new Date() : null } });
    await writeAuditEvent({ businessId: input.businessId, type: archived ? "staff.archived" : "staff.restored", actorType: "USER", actorId: input.actorUserId, metadata: { staffId: input.staffId } }, transaction);
    return { id: result.id, archivedAt: result.archivedAt };
  });
}
