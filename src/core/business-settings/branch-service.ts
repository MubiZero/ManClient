import { randomBytes } from "node:crypto";

import { branchInputSchema } from "@/core/business-settings/setting-schemas";
import { requireSettingsAccess } from "@/core/business-settings/authorize-settings";
import { SettingsError } from "@/core/business-settings/settings-error";
import { prisma } from "@/core/database/prisma";
import { encryptCardNumber } from "@/core/payments/card-encryption";
import { writeAuditEvent } from "@/core/audit/audit-service";

type BranchInput = {
  businessId: string;
  actorUserId: string;
  name: string;
  address?: string;
  phone?: string;
  timeZone: string;
  /** Where transfers for this branch arrive. Blank keeps whatever is stored. */
  recipientCard?: string;
};

export async function createBranch(input: BranchInput) {
  const { card, ...value } = parseBranch(input);
  return prisma.$transaction(async transaction => {
    await requireSettingsAccess(transaction, input);
    const branch = await transaction.branch.create({
      data: { businessId: input.businessId, slug: uniqueSlug(value.name), ...value, ...card },
      select: { id: true },
    });
    await audit(transaction, input, "branch.created", branch.id, card);
    return branch;
  });
}

export async function updateBranch(input: BranchInput & { branchId: string }) {
  const { card, ...value } = parseBranch(input);
  return prisma.$transaction(async transaction => {
    await requireSettingsAccess(transaction, input);
    const result = await transaction.branch.updateMany({
      where: { id: input.branchId, businessId: input.businessId },
      data: { ...value, ...card },
    });
    if (result.count !== 1) throw new SettingsError("NOT_FOUND");
    await audit(transaction, input, "branch.updated", input.branchId, card);
    return { id: input.branchId };
  });
}

export async function archiveBranch(input: { businessId: string; actorUserId: string; branchId: string }) {
  return setBranchArchived(input, true);
}

export async function restoreBranch(input: { businessId: string; actorUserId: string; branchId: string }) {
  return setBranchArchived(input, false);
}

async function setBranchArchived(input: { businessId: string; actorUserId: string; branchId: string }, archived: boolean) {
  return prisma.$transaction(async transaction => {
    await requireSettingsAccess(transaction, input);
    const branch = await transaction.branch.findFirst({ where: { id: input.branchId, businessId: input.businessId }, select: { archivedAt: true } });
    if (!branch) throw new SettingsError("NOT_FOUND");
    if (archived) {
      const [activeBranches, futureBookings] = await Promise.all([
        transaction.branch.count({ where: { businessId: input.businessId, archivedAt: null } }),
        transaction.booking.count({ where: { branchId: input.branchId, startsAt: { gte: new Date() }, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } } }),
      ]);
      if (activeBranches <= 1) throw new SettingsError("LAST_ACTIVE_BRANCH");
      if (futureBookings > 0) throw new SettingsError("FUTURE_BOOKINGS", { count: futureBookings });
    }
    await transaction.branch.update({ where: { id: input.branchId }, data: { archivedAt: archived ? new Date() : null } });
    await audit(transaction, input, archived ? "branch.archived" : "branch.restored", input.branchId);
    return { id: input.branchId, archivedAt: archived ? new Date() : null };
  });
}

/**
 * Splits the branch fields from the card, because the card is not a field like the others: it is written
 * only when a new number was actually typed, and what reaches the database is ciphertext plus the four
 * digits the cabinet is allowed to show.
 */
function parseBranch(input: BranchInput) {
  const recipientCard = input.recipientCard?.trim();
  const parsed = branchInputSchema.safeParse({
    name: input.name,
    address: input.address,
    phone: input.phone,
    timeZone: input.timeZone,
    ...(recipientCard ? { recipientCard } : {}),
  });
  if (!parsed.success) throw new SettingsError("INVALID_INPUT");
  const { recipientCard: card, ...value } = parsed.data;
  return { ...value, card: card ? encryptedCard(card) : undefined };
}

function encryptedCard(recipientCard: string) {
  const encryptionKey = process.env.CARD_ENCRYPTION_KEY;
  if (!encryptionKey) throw new SettingsError("INVALID_INPUT");
  return {
    recipientCardEncrypted: encryptCardNumber(recipientCard, encryptionKey),
    recipientCardLast4: recipientCard.slice(-4),
  };
}

function uniqueSlug(name: string) {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "branch";
  return `${base}-${randomBytes(3).toString("hex")}`;
}

/** Only the last four digits are ever recorded: the audit log is read by support, the card number is not. */
function audit(
  transaction: Parameters<typeof writeAuditEvent>[1],
  input: { businessId: string; actorUserId: string },
  type: string,
  branchId: string,
  card?: { recipientCardLast4: string },
) {
  return writeAuditEvent({
    businessId: input.businessId,
    type,
    actorType: "USER",
    actorId: input.actorUserId,
    metadata: { branchId, ...(card ? { recipientCardLast4: card.recipientCardLast4 } : {}) },
  }, transaction);
}
