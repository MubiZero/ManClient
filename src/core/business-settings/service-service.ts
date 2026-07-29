import { serviceInputSchema } from "@/core/business-settings/setting-schemas";
import { requireSettingsAccess } from "@/core/business-settings/authorize-settings";
import { SettingsError } from "@/core/business-settings/settings-error";
import { prisma } from "@/core/database/prisma";
import { parseSomoniToDiram } from "@/core/formatting/money";
import { writeAuditEvent } from "@/core/audit/audit-service";

type ServiceInput = {
  businessId: string;
  actorUserId: string;
  branchId: string;
  name: string;
  description?: string;
  durationMinutes: string | number;
  amountSomoni: string;
  staffIds: string[];
  resourceIds: string[];
  isPublished: boolean;
};

export function createService(input: ServiceInput) { return saveService(input); }
export function updateService(input: ServiceInput & { serviceId: string }) { return saveService(input); }

async function saveService(input: ServiceInput & { serviceId?: string }) {
  const parsed = serviceInputSchema.safeParse(pickInput(input));
  if (!parsed.success) throw new SettingsError("INVALID_INPUT");
  const value = parsed.data;
  const amountDiram = parseSomoniToDiram(value.amountSomoni);
  return prisma.$transaction(async transaction => {
    await requireSettingsAccess(transaction, input);
    const [branch, staff, resources, scheduleCount] = await Promise.all([
      transaction.branch.findFirst({ where: { id: value.branchId, businessId: input.businessId, archivedAt: null }, select: { id: true } }),
      transaction.staffMember.findMany({ where: { id: { in: value.staffIds }, businessId: input.businessId, archivedAt: null, branches: { some: { branchId: value.branchId } } }, select: { id: true } }),
      transaction.resource.findMany({ where: { id: { in: value.resourceIds }, branchId: value.branchId, archivedAt: null, isAvailable: true }, select: { id: true } }),
      transaction.businessScheduleRule.count({ where: { branchId: value.branchId } }),
    ]);
    if (!branch || staff.length !== value.staffIds.length || resources.length !== value.resourceIds.length) throw new SettingsError("INVALID_INPUT");
    if (value.isPublished && (!value.staffIds.length || scheduleCount === 0)) throw new SettingsError("CANNOT_PUBLISH");

    let serviceId = input.serviceId;
    if (serviceId) {
      const result = await transaction.service.updateMany({ where: { id: serviceId, branch: { businessId: input.businessId } }, data: { branchId: value.branchId, name: value.name, description: value.description, durationMinutes: value.durationMinutes, amountDiram, isPublished: value.isPublished } });
      if (result.count !== 1) throw new SettingsError("NOT_FOUND");
      await transaction.service.update({ where: { id: serviceId }, data: { staffMembers: { set: value.staffIds.map(id => ({ id })) } } });
      await transaction.serviceResource.deleteMany({ where: { serviceId } });
    } else {
      serviceId = (await transaction.service.create({ data: { branchId: value.branchId, name: value.name, description: value.description, durationMinutes: value.durationMinutes, amountDiram, isPublished: value.isPublished, staffMembers: { connect: value.staffIds.map(id => ({ id })) } }, select: { id: true } })).id;
    }
    if (value.resourceIds.length) await transaction.serviceResource.createMany({ data: value.resourceIds.map(resourceId => ({ serviceId: serviceId!, resourceId })) });
    await writeAuditEvent({ businessId: input.businessId, type: input.serviceId ? "service.updated" : "service.created", actorType: "USER", actorId: input.actorUserId, metadata: { serviceId } }, transaction);
    return { id: serviceId };
  });
}

export async function duplicateService(input: { businessId: string; actorUserId: string; serviceId: string }) {
  const source = await prisma.service.findFirst({ where: { id: input.serviceId, branch: { businessId: input.businessId }, archivedAt: null }, include: { staffMembers: true, resources: true } });
  if (!source) throw new SettingsError("NOT_FOUND");
  return createService({ businessId: input.businessId, actorUserId: input.actorUserId, branchId: source.branchId, name: `${source.name}, копия`, description: source.description ?? undefined, durationMinutes: source.durationMinutes, amountSomoni: (source.amountDiram / 100).toFixed(2), staffIds: source.staffMembers.map(item => item.id), resourceIds: source.resources.map(item => item.resourceId), isPublished: false });
}

export function archiveService(input: { businessId: string; actorUserId: string; serviceId: string }) { return setArchived(input, true); }
export function restoreService(input: { businessId: string; actorUserId: string; serviceId: string }) { return setArchived(input, false); }

async function setArchived(input: { businessId: string; actorUserId: string; serviceId: string }, archived: boolean) {
  return prisma.$transaction(async transaction => {
    await requireSettingsAccess(transaction, input);
    const service = await transaction.service.findFirst({ where: { id: input.serviceId, branch: { businessId: input.businessId } }, select: { id: true } });
    if (!service) throw new SettingsError("NOT_FOUND");
    if (archived) {
      const count = await transaction.booking.count({ where: { serviceId: input.serviceId, startsAt: { gte: new Date() }, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } } });
      if (count) throw new SettingsError("FUTURE_BOOKINGS", { count });
    }
    const result = await transaction.service.update({ where: { id: input.serviceId }, data: { archivedAt: archived ? new Date() : null, isPublished: archived ? false : undefined } });
    await writeAuditEvent({ businessId: input.businessId, type: archived ? "service.archived" : "service.restored", actorType: "USER", actorId: input.actorUserId, metadata: { serviceId: input.serviceId } }, transaction);
    return { id: result.id, archivedAt: result.archivedAt };
  });
}

function pickInput(input: ServiceInput) {
  return { branchId: input.branchId, name: input.name, description: input.description, durationMinutes: input.durationMinutes, amountSomoni: input.amountSomoni, staffIds: input.staffIds, resourceIds: input.resourceIds, isPublished: input.isPublished };
}
