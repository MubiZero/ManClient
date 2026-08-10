import { checkIntegrationHealthAlerts } from "@/core/platform/integration-alerts";
import { retryReceiptSubmissions } from "@/core/payments/receipt-submission-service";
import { expirePendingBookings } from "@/jobs/expire-pending-bookings";
import { runDataRetention } from "@/core/maintenance/data-retention";
import { runSecurityMaintenance } from "@/core/security/security-maintenance";
import { sendDueBookingReminders } from "@/jobs/send-booking-reminder";
import { sendDueBusinessTelegramNotifications } from "@/jobs/send-business-telegram-notifications";
import { runSubscriptionLifecycle } from "@/jobs/subscription-lifecycle";

/**
 * One list of background jobs, shared by the long-running scheduler and the one-shot `pnpm jobs:*`
 * entry points. Before this existed the two disagreed about which jobs there are — the scheduler ran
 * five, the scripts covered four — so a deployment that used cron instead of the scheduler quietly
 * never expired a phone code or alerted on a broken integration.
 */

export type ScheduledJob = {
  name: string;
  run: () => Promise<number>;
  /**
   * Shortest gap between runs. Absent means "every tick", which is right for anything that delivers
   * messages; housekeeping that sweeps months-old rows would otherwise re-ask the same question sixty
   * times an hour and find nothing.
   */
  intervalMs?: number;
};

export const SCHEDULED_JOBS: readonly ScheduledJob[] = [
  { name: "expire-pending-bookings", run: () => expirePendingBookings() },
  { name: "booking-reminders", run: () => sendDueBookingReminders() },
  { name: "business-notifications", run: () => sendDueBusinessTelegramNotifications() },
  { name: "receipt-processing", run: () => retryReceiptSubmissions() },
  { name: "integration-health-alerts", run: () => checkIntegrationHealthAlerts() },
  { name: "security-maintenance", run: () => runSecurityMaintenance() },
  // Hourly is enough for a boundary measured in days, and it keeps the warning from arriving at
  // whatever minute of the night the period happens to end on.
  { name: "subscription-lifecycle", run: () => runSubscriptionLifecycle(), intervalMs: 60 * 60_000 },
  { name: "data-retention", run: () => runDataRetention(), intervalMs: 60 * 60_000 },
];

export function findScheduledJob(name: string): ScheduledJob | undefined {
  return SCHEDULED_JOBS.find((job) => job.name === name);
}
