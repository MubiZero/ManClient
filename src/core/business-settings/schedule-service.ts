import { weeklyScheduleSchema } from "@/core/business-settings/setting-schemas";
import { requireSettingsAccess } from "@/core/business-settings/authorize-settings";
import { SettingsError } from "@/core/business-settings/settings-error";
import { prisma } from "@/core/database/prisma";
import { publishFirstServiceWhenReady } from "@/core/onboarding/publish-first-service";
import { writeAuditEvent } from "@/core/audit/audit-service";

type Interval = { dayOfWeek: number; startsAt: string; endsAt: string };
type ScheduleInput = { businessId: string; actorUserId: string; branchId: string; rules: Interval[]; breaks: Interval[] };

export async function replaceBranchSchedule(input: ScheduleInput) {
  const schedule = parseSchedule(input);
  const result = await prisma.$transaction(async transaction => {
    await requireSettingsAccess(transaction, input);
    const branch = await transaction.branch.findFirst({ where: { id: input.branchId, businessId: input.businessId, archivedAt: null }, select: { id: true } });
    if (!branch) throw new SettingsError("NOT_FOUND");
    await transaction.businessScheduleRule.deleteMany({ where: { branchId: input.branchId } });
    await transaction.scheduleBreak.deleteMany({ where: { branchId: input.branchId, staffId: null } });
    if (schedule.rules.length) await transaction.businessScheduleRule.createMany({ data: schedule.rules.map(rule => ({ branchId: input.branchId, ...rule })) });
    if (schedule.breaks.length) await transaction.scheduleBreak.createMany({ data: schedule.breaks.map(item => ({ branchId: input.branchId, ...item })) });
    await audit(transaction, input, "schedule.branch.updated", { branchId: input.branchId });
    return { branchId: input.branchId };
  });
  // Opening hours are one of the two things onboarding's first service waits on, and they are set here
  // rather than in the wizard — a salon that fills them in months later should not have to go back and
  // publish by hand to make its own booking link work.
  await publishFirstServiceWhenReady(input.businessId);
  return result;
}

export async function replaceStaffSchedule(input: ScheduleInput & { staffId: string }) {
  const schedule = parseSchedule(input);
  return prisma.$transaction(async transaction => {
    await requireSettingsAccess(transaction, input);
    const staff = await transaction.staffMember.findFirst({ where: { id: input.staffId, businessId: input.businessId, archivedAt: null, branches: { some: { branchId: input.branchId } } }, select: { id: true } });
    if (!staff) throw new SettingsError("NOT_FOUND");
    await transaction.staffScheduleRule.deleteMany({ where: { staffId: input.staffId, branchId: input.branchId } });
    await transaction.scheduleBreak.deleteMany({ where: { staffId: input.staffId, branchId: input.branchId } });
    if (schedule.rules.length) await transaction.staffScheduleRule.createMany({ data: schedule.rules.map(rule => ({ staffId: input.staffId, branchId: input.branchId, ...rule })) });
    if (schedule.breaks.length) await transaction.scheduleBreak.createMany({ data: schedule.breaks.map(item => ({ staffId: input.staffId, branchId: input.branchId, ...item })) });
    await audit(transaction, input, "schedule.staff.updated", { branchId: input.branchId, staffId: input.staffId });
    return { branchId: input.branchId, staffId: input.staffId };
  });
}

export async function upsertScheduleException(input: {
  businessId: string;
  actorUserId: string;
  branchId: string;
  staffId?: string;
  startsAt: Date;
  endsAt: Date;
  available: boolean;
  note?: string;
  exceptionId?: string;
}) {
  if (!(input.startsAt instanceof Date) || !(input.endsAt instanceof Date) || input.startsAt >= input.endsAt || input.note?.length && input.note.length > 240) throw new SettingsError("INVALID_INPUT");
  return prisma.$transaction(async transaction => {
    await requireSettingsAccess(transaction, input);
    const branch = await transaction.branch.findFirst({ where: { id: input.branchId, businessId: input.businessId }, select: { id: true } });
    const staff = input.staffId ? await transaction.staffMember.findFirst({ where: { id: input.staffId, businessId: input.businessId, branches: { some: { branchId: input.branchId } } }, select: { id: true } }) : null;
    if (!branch || input.staffId && !staff) throw new SettingsError("NOT_FOUND");
    const data = { branchId: input.branchId, staffId: input.staffId, startsAt: input.startsAt, endsAt: input.endsAt, available: input.available, note: input.note?.trim() || null };
    const exception = input.exceptionId
      ? await transaction.scheduleException.update({ where: { id: input.exceptionId }, data })
      : await transaction.scheduleException.create({ data });
    await audit(transaction, input, "schedule.exception.saved", { branchId: input.branchId, exceptionId: exception.id });
    return { id: exception.id };
  });
}

export async function removeScheduleException(input: { businessId: string; actorUserId: string; exceptionId: string }) {
  return prisma.$transaction(async transaction => {
    await requireSettingsAccess(transaction, input);
    const exception = await transaction.scheduleException.findFirst({ where: { id: input.exceptionId, branch: { businessId: input.businessId } }, select: { id: true } });
    if (!exception) throw new SettingsError("NOT_FOUND");
    await transaction.scheduleException.delete({ where: { id: input.exceptionId } });
    await audit(transaction, input, "schedule.exception.removed", { exceptionId: input.exceptionId });
  });
}

function parseSchedule(input: ScheduleInput) {
  const parsed = weeklyScheduleSchema.safeParse({ rules: input.rules, breaks: input.breaks });
  if (!parsed.success) throw new SettingsError("INVALID_INPUT");
  return parsed.data;
}

function audit(transaction: Parameters<typeof writeAuditEvent>[1], input: { businessId: string; actorUserId: string }, type: string, metadata: Record<string, string>) {
  return writeAuditEvent({ businessId: input.businessId, type, actorType: "USER", actorId: input.actorUserId, metadata }, transaction);
}
