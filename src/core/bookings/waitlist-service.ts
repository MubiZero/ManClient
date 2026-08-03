import type { Prisma, WaitlistStatus } from "@/generated/prisma/client";

import { SettingsError } from "@/core/business-settings/settings-error";
import { prisma } from "@/core/database/prisma";
import { normalizeTajikPhone } from "@/core/formatting/tajik-phone";
import { requirePlanFeature } from "@/core/platform/subscription-plans";
import { decryptSecret } from "@/core/security/secret-encryption";
import { createTelegramApi } from "@/integrations/telegram/telegram-api";

const WAITLIST_NOTIFY_LIMIT = 3;
const WAITLIST_PAGE_SIZE = 50;

type WaitlistJoinDatabase = Pick<Prisma.TransactionClient, "business" | "customer" | "waitlistEntry">;
type WaitlistNotifyDatabase = Pick<
  Prisma.TransactionClient,
  "waitlistEntry" | "customer" | "businessTelegramIntegration"
>;

export type JoinWaitlistInput = {
  businessId: string;
  branchId: string;
  serviceId: string;
  staffId?: string | null;
  customer: { name: string; phone: string };
  desiredFrom: Date;
  desiredTo: Date;
};

export async function joinWaitlist(input: JoinWaitlistInput, database: WaitlistJoinDatabase = prisma) {
  const business = await database.business.findUnique({ where: { id: input.businessId }, select: { id: true, subscriptionPlan: true } });
  if (!business) throw new SettingsError("NOT_FOUND");
  requirePlanFeature(business.subscriptionPlan, "WAITLIST");

  const phone = normalizeTajikPhone(input.customer.phone);
  if (!phone) throw new SettingsError("INVALID_INPUT");
  const name = input.customer.name.trim();
  if (name.length < 2 || name.length > 120) throw new SettingsError("INVALID_INPUT");
  if (!(input.desiredFrom instanceof Date) || !(input.desiredTo instanceof Date) || Number.isNaN(input.desiredFrom.getTime()) || Number.isNaN(input.desiredTo.getTime())) {
    throw new SettingsError("INVALID_INPUT");
  }
  if (input.desiredFrom >= input.desiredTo) throw new SettingsError("INVALID_INPUT");

  const customer = await database.customer.upsert({
    where: { businessId_phone: { businessId: input.businessId, phone } },
    create: { businessId: input.businessId, name, phone },
    update: { name },
  });

  const entry = await database.waitlistEntry.create({
    data: {
      businessId: input.businessId,
      branchId: input.branchId,
      serviceId: input.serviceId,
      staffId: input.staffId ?? null,
      customerId: customer.id,
      desiredFrom: input.desiredFrom,
      desiredTo: input.desiredTo,
      status: "WAITING",
    },
  });

  return { id: entry.id };
}

export type NotifyWaitlistForFreedSlotInput = {
  businessId: string;
  branchId: string;
  serviceId: string;
  staffId?: string | null;
  freedStartsAt: Date;
  freedEndsAt: Date;
};

/**
 * Notifies up to WAITLIST_NOTIFY_LIMIT waiting customers whose desired window covers a slot that
 * just freed up (e.g. after a cancellation), oldest request first. Marks each notified entry as
 * NOTIFIED so at most a handful of people race for the same freed slot.
 *
 * NOTE ON DELIVERY: WaitlistEntry has no bookingId, but Message.bookingId is a required column, so
 * the existing Message-queue notification pipeline (scheduleBookingReminders and friends, processed
 * by src/jobs/send-booking-reminder.ts) cannot be reused as-is without a schema change. Per scope,
 * we do not touch prisma/schema.prisma, so this sends Telegram notifications synchronously and
 * directly (mirroring the low-level delivery call in send-booking-reminder.ts) instead of queuing a
 * Message row. WhatsApp is intentionally skipped: WhatsApp delivery requires a pre-approved message
 * template (whatsappTemplateName / whatsappConfirmationTemplateName / whatsappCancellationTemplateName),
 * and no such template exists for "waitlist slot available" without adding a new business setting -
 * out of scope here. If a customer has no linked Telegram chat (or the business has no active bot),
 * the entry is still marked NOTIFIED (they consumed one of the notify slots) but no message is sent.
 */
export async function notifyWaitlistForFreedSlot(
  input: NotifyWaitlistForFreedSlotInput,
  database: WaitlistNotifyDatabase = prisma,
  now = new Date(),
) {
  const candidates = await database.waitlistEntry.findMany({
    where: {
      businessId: input.businessId,
      branchId: input.branchId,
      serviceId: input.serviceId,
      status: "WAITING" satisfies WaitlistStatus,
      ...(input.staffId ? { OR: [{ staffId: null }, { staffId: input.staffId }] } : {}),
      desiredFrom: { lte: input.freedStartsAt },
      desiredTo: { gte: input.freedEndsAt },
    },
    orderBy: { createdAt: "asc" },
    take: WAITLIST_NOTIFY_LIMIT,
  });
  if (candidates.length === 0) return 0;

  const customers = await database.customer.findMany({ where: { id: { in: candidates.map((entry) => entry.customerId) } } });
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const integration = await database.businessTelegramIntegration.findFirst({ where: { businessId: input.businessId, status: "ACTIVE" } });
  const encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY;

  let notified = 0;
  for (const entry of candidates) {
    await database.waitlistEntry.update({ where: { id: entry.id }, data: { status: "NOTIFIED", notifiedAt: now } });
    notified += 1;

    const customer = customerById.get(entry.customerId);
    if (!customer?.telegramChatId || !integration?.botTokenEncrypted || !encryptionKey) continue;
    try {
      const token = decryptSecret(integration.botTokenEncrypted, encryptionKey);
      await createTelegramApi(token).sendMessage(customer.telegramChatId, waitlistSlotAvailableText(customer.telegramLocale));
    } catch {
      // Best-effort delivery: a Telegram failure must not fail the caller's transaction
      // (e.g. a booking cancellation), so we swallow it here.
    }
  }
  return notified;
}

function waitlistSlotAvailableText(locale: string) {
  return locale === "tg"
    ? "Хушхабар! Вақти озод дар листи интизорӣ пайдо шуд. Лутфан барои сабт ҳарчи зудтар бо мо тамос гиред."
    : "Освободилось время из вашего листа ожидания! Свяжитесь с нами как можно скорее, чтобы записаться.";
}

export type WaitlistEntrySummary = {
  id: string;
  branchName: string;
  serviceName: string;
  customerName: string;
  customerPhone: string;
  status: WaitlistStatus;
  desiredFrom: Date;
  desiredTo: Date;
  createdAt: Date;
};

export async function listWaitlistEntries(businessId: string, cursor?: string | null): Promise<{ items: WaitlistEntrySummary[]; nextCursor: string | null }> {
  const rows = await prisma.waitlistEntry.findMany({
    where: { businessId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: WAITLIST_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > WAITLIST_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, WAITLIST_PAGE_SIZE) : rows;

  const [branches, services, customers] = await Promise.all([
    prisma.branch.findMany({ where: { id: { in: [...new Set(page.map((entry) => entry.branchId))] } }, select: { id: true, name: true } }),
    prisma.service.findMany({ where: { id: { in: [...new Set(page.map((entry) => entry.serviceId))] } }, select: { id: true, name: true } }),
    prisma.customer.findMany({ where: { id: { in: [...new Set(page.map((entry) => entry.customerId))] } }, select: { id: true, name: true, phone: true } }),
  ]);
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const serviceById = new Map(services.map((service) => [service.id, service]));
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));

  const items = page.map((entry) => ({
    id: entry.id,
    branchName: branchById.get(entry.branchId)?.name ?? "—",
    serviceName: serviceById.get(entry.serviceId)?.name ?? "—",
    customerName: customerById.get(entry.customerId)?.name ?? "—",
    customerPhone: customerById.get(entry.customerId)?.phone ?? "—",
    status: entry.status,
    desiredFrom: entry.desiredFrom,
    desiredTo: entry.desiredTo,
    createdAt: entry.createdAt,
  }));

  return { items, nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null };
}

export async function cancelWaitlistEntry(input: { businessId: string; waitlistEntryId: string }) {
  const result = await prisma.waitlistEntry.updateMany({
    where: { id: input.waitlistEntryId, businessId: input.businessId, status: { in: ["WAITING", "NOTIFIED"] } },
    data: { status: "CANCELLED" },
  });
  if (result.count === 0) throw new SettingsError("NOT_FOUND");
}
