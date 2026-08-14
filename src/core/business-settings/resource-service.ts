import { resourceInputSchema, invalidInputFor } from "@/core/business-settings/setting-schemas";
import { requireSettingsAccess } from "@/core/business-settings/authorize-settings";
import { SettingsError } from "@/core/business-settings/settings-error";
import { prisma } from "@/core/database/prisma";
import { writeAuditEvent } from "@/core/audit/audit-service";

type ResourceInput = {
  businessId: string;
  actorUserId: string;
  branchId: string;
  name: string;
  kind: "WORKSTATION" | "ROOM" | "LIFT" | "EQUIPMENT" | "OTHER";
  capacity: string | number;
  isAvailable: boolean;
  serviceIds: string[];
};

export function createResource(input: ResourceInput) { return saveResource(input); }
export function updateResource(input: ResourceInput & { resourceId: string }) { return saveResource(input); }

async function saveResource(input: ResourceInput & { resourceId?: string }) {
  const parsed = resourceInputSchema.safeParse(pickInput(input));
  if (!parsed.success) throw invalidInputFor(parsed.error);
  const value = parsed.data;
  return prisma.$transaction(async transaction => {
    await requireSettingsAccess(transaction, input);
    const [branch, services] = await Promise.all([
      transaction.branch.findFirst({ where: { id: value.branchId, businessId: input.businessId, archivedAt: null }, select: { id: true } }),
      transaction.service.findMany({ where: { id: { in: value.serviceIds }, branchId: value.branchId, branch: { businessId: input.businessId }, archivedAt: null }, select: { id: true } }),
    ]);
    if (!branch || services.length !== value.serviceIds.length) throw new SettingsError("INVALID_INPUT");
    let resourceId = input.resourceId;
    if (resourceId) {
      const result = await transaction.resource.updateMany({ where: { id: resourceId, branch: { businessId: input.businessId } }, data: { branchId: value.branchId, name: value.name, kind: value.kind, capacity: value.capacity, isAvailable: value.isAvailable } });
      if (result.count !== 1) throw new SettingsError("NOT_FOUND");
      await transaction.serviceResource.deleteMany({ where: { resourceId } });
    } else {
      resourceId = (await transaction.resource.create({ data: { branchId: value.branchId, name: value.name, kind: value.kind, capacity: value.capacity, isAvailable: value.isAvailable }, select: { id: true } })).id;
    }
    if (value.serviceIds.length) await transaction.serviceResource.createMany({ data: value.serviceIds.map(serviceId => ({ serviceId, resourceId: resourceId! })) });
    await writeAuditEvent({ businessId: input.businessId, type: input.resourceId ? "resource.updated" : "resource.created", actorType: "USER", actorId: input.actorUserId, metadata: { resourceId } }, transaction);
    return { id: resourceId };
  });
}

export function archiveResource(input: { businessId: string; actorUserId: string; resourceId: string }) { return setArchived(input, true); }
export function restoreResource(input: { businessId: string; actorUserId: string; resourceId: string }) { return setArchived(input, false); }

async function setArchived(input: { businessId: string; actorUserId: string; resourceId: string }, archived: boolean) {
  return prisma.$transaction(async transaction => {
    await requireSettingsAccess(transaction, input);
    const resource = await transaction.resource.findFirst({ where: { id: input.resourceId, branch: { businessId: input.businessId } }, select: { id: true } });
    if (!resource) throw new SettingsError("NOT_FOUND");
    if (archived) {
      const count = await transaction.booking.count({ where: { resources: { some: { resourceId: input.resourceId } }, startsAt: { gte: new Date() }, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } } });
      if (count) throw new SettingsError("FUTURE_BOOKINGS", { count });
    }
    const result = await transaction.resource.update({ where: { id: input.resourceId }, data: { archivedAt: archived ? new Date() : null } });
    await writeAuditEvent({ businessId: input.businessId, type: archived ? "resource.archived" : "resource.restored", actorType: "USER", actorId: input.actorUserId, metadata: { resourceId: input.resourceId } }, transaction);
    return { id: result.id, archivedAt: result.archivedAt };
  });
}

function pickInput(input: ResourceInput) {
  return { branchId: input.branchId, name: input.name, kind: input.kind, capacity: input.capacity, isAvailable: input.isAvailable, serviceIds: input.serviceIds };
}
