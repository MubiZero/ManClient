import { checkIntegrationHealthAlerts } from "@/core/platform/integration-alerts";
import { retryReceiptSubmissions } from "@/core/payments/receipt-submission-service";
import { expirePendingBookings } from "@/jobs/expire-pending-bookings";
import { runSecurityMaintenance } from "@/core/security/security-maintenance";
import { sendDueBookingReminders } from "@/jobs/send-booking-reminder";
import { sendDueBusinessTelegramNotifications } from "@/jobs/send-business-telegram-notifications";

/**
 * One list of background jobs, shared by the long-running scheduler and the one-shot `pnpm jobs:*`
 * entry points. Before this existed the two disagreed about which jobs there are — the scheduler ran
 * five, the scripts covered four — so a deployment that used cron instead of the scheduler quietly
 * never expired a phone code or alerted on a broken integration.
 */

export type ScheduledJob = {
  name: string;
  run: () => Promise<number>;
};

export const SCHEDULED_JOBS: readonly ScheduledJob[] = [
  { name: "expire-pending-bookings", run: () => expirePendingBookings() },
  { name: "booking-reminders", run: () => sendDueBookingReminders() },
  { name: "business-notifications", run: () => sendDueBusinessTelegramNotifications() },
  { name: "receipt-processing", run: () => retryReceiptSubmissions() },
  { name: "integration-health-alerts", run: () => checkIntegrationHealthAlerts() },
  { name: "security-maintenance", run: () => runSecurityMaintenance() },
];

export function findScheduledJob(name: string): ScheduledJob | undefined {
  return SCHEDULED_JOBS.find((job) => job.name === name);
}
