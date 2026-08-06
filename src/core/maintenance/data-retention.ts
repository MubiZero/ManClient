import { prisma } from "@/core/database/prisma";
import { logger } from "@/core/observability/logger";

/**
 * Deletes rows that have stopped being evidence and become weight. Three tables grow with traffic and are
 * read only inside a short window: the webhook ids that make Telegram retries idempotent, the one-shot
 * callback tokens behind conversation buttons, and delivery bookkeeping for messages that have already
 * been sent or given up on.
 *
 * What is deliberately never touched: payments, receipt submissions and their images, audit events,
 * bookings and customers. Those are the record of what happened to somebody's money, and a business may
 * be asked about them a year later — their growth is a storage decision to take deliberately, not a
 * side effect of a cleanup job.
 */

/** Long enough that a webhook retried for hours is still recognised as a duplicate. */
const INBOUND_UPDATE_DAYS = 30;
/** Callback tokens die within a session; a week of slack keeps expired ones auditable in the meantime. */
const EXPIRED_ACTION_DAYS = 7;
/**
 * Half a year for delivery rows. The visit they belong to is long past, but "did the reminder go out"
 * is a question businesses do ask about recent months.
 */
const SETTLED_MESSAGE_DAYS = 180;

/** Per table, per run. A retention sweep must never be the query that holds locks for minutes. */
const MAX_ROWS_PER_TABLE = 5_000;

const SETTLED_STATUSES = ["SENT", "SKIPPED", "FAILED"] as const;

export async function runDataRetention(now = new Date()): Promise<number> {
  const inboundBefore = daysBefore(now, INBOUND_UPDATE_DAYS);
  const actionsBefore = daysBefore(now, EXPIRED_ACTION_DAYS);
  const messagesBefore = daysBefore(now, SETTLED_MESSAGE_DAYS);

  const inboundUpdates = await deleteInChunks(
    () => prisma.inboundChannelUpdate.findMany({ where: { receivedAt: { lt: inboundBefore } }, select: { id: true }, take: MAX_ROWS_PER_TABLE }),
    (ids) => prisma.inboundChannelUpdate.deleteMany({ where: { id: { in: ids } } }),
  );
  const conversationActions = await deleteInChunks(
    () => prisma.conversationAction.findMany({ where: { expiresAt: { lt: actionsBefore } }, select: { id: true }, take: MAX_ROWS_PER_TABLE }),
    (ids) => prisma.conversationAction.deleteMany({ where: { id: { in: ids } } }),
  );
  const messages = await deleteInChunks(
    () => prisma.message.findMany({ where: { status: { in: [...SETTLED_STATUSES] }, createdAt: { lt: messagesBefore } }, select: { id: true }, take: MAX_ROWS_PER_TABLE }),
    (ids) => prisma.message.deleteMany({ where: { id: { in: ids } } }),
  );
  // Deliveries hang off the notification and go with it, so only the parent needs sweeping.
  const notifications = await deleteInChunks(
    () => prisma.businessNotification.findMany({ where: { status: { in: [...SETTLED_STATUSES] }, createdAt: { lt: messagesBefore } }, select: { id: true }, take: MAX_ROWS_PER_TABLE }),
    (ids) => prisma.businessNotification.deleteMany({ where: { id: { in: ids } } }),
  );

  const total = inboundUpdates + conversationActions + messages + notifications;
  if (total > 0) logger.info("retention.swept", { inboundUpdates, conversationActions, messages, notifications });
  return total;
}

async function deleteInChunks(
  find: () => Promise<Array<{ id: string }>>,
  remove: (ids: string[]) => Promise<{ count: number }>,
): Promise<number> {
  const rows = await find();
  if (rows.length === 0) return 0;
  const { count } = await remove(rows.map((row) => row.id));
  return count;
}

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60_000);
}
