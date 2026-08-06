import { logger, serializeError, type LogContext } from "@/core/observability/logger";

/**
 * A failure nobody watches is a failure the business reports to us by phone. Until a hosted error
 * tracker is paid for, the alerting channel we already operate is the platform admin's private chat
 * with @manclient_bot — the same one integration health alerts use.
 *
 * Two properties matter more than delivery guarantees here: reporting must never throw into the
 * caller's path (an alert failing cannot turn a handled error into a 500), and identical errors must
 * not flood the chat. Throttling is per fingerprint, in process: a restart or a second instance may
 * resend, which is a far better failure mode than a silent one.
 */

const ALERT_COOLDOWN_MS = 60 * 60_000;
const MAX_TRACKED_FINGERPRINTS = 500;

const lastAlertedAt = new Map<string, number>();

type ErrorReport = {
  /** Stable, low-cardinality name of the failing operation, e.g. `telegram.webhook`. */
  event: string;
  error: unknown;
  context?: LogContext;
  /** Overrides the throttling key when one event covers several distinct failures. */
  fingerprint?: string;
};

type ReportDependencies = {
  sendAlert: (chatId: string, text: string) => Promise<unknown>;
};

async function defaultSendAlert(chatId: string, text: string): Promise<unknown> {
  // Imported lazily: the Telegram client pulls in the whole integration layer, and reporting an
  // error must stay usable from modules that have no business depending on it.
  const { createTelegramApi } = await import("@/integrations/telegram/telegram-api");
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  return createTelegramApi(token).sendMessage(chatId, text);
}

export function reportError(report: ErrorReport, dependencies: ReportDependencies = { sendAlert: defaultSendAlert }): void {
  logger.error(report.event, { ...report.context, error: serializeError(report.error) });

  const chatId = process.env.PLATFORM_ADMIN_ALERT_CHAT_ID;
  if (!chatId) return;

  const fingerprint = report.fingerprint ?? `${report.event}:${errorSummary(report.error)}`;
  const now = Date.now();
  const previous = lastAlertedAt.get(fingerprint);
  if (previous !== undefined && now - previous < ALERT_COOLDOWN_MS) return;
  if (lastAlertedAt.size >= MAX_TRACKED_FINGERPRINTS) lastAlertedAt.clear();
  lastAlertedAt.set(fingerprint, now);

  void dependencies
    .sendAlert(chatId, formatAlert(report))
    .catch((alertError: unknown) => logger.warn("observability.alert_failed", { event: report.event, error: serializeError(alertError) }));
}

/** Test seam: throttling is process-global, so suites that assert on alerts must be able to reset it. */
export function resetErrorReportThrottle(): void {
  lastAlertedAt.clear();
}

function errorSummary(error: unknown): string {
  if (!(error instanceof Error)) return String(error).slice(0, 120);
  return `${error.name}:${error.message}`.slice(0, 120);
}

function formatAlert(report: ErrorReport): string {
  const context = report.context ? Object.entries(report.context).map(([key, value]) => `${key}=${String(value)}`) : [];
  return [
    `🔥 ${report.event}`,
    errorSummary(report.error),
    ...(context.length ? [context.join(" ")] : []),
    "Дальнейшие такие же ошибки не дублируются в течение часа.",
  ].join("\n");
}
