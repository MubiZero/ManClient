import { expirePendingBookings } from "@/jobs/expire-pending-bookings";
import { sendDueBookingReminders } from "@/jobs/send-booking-reminder";
import { sendDueBusinessTelegramNotifications } from "@/jobs/send-business-telegram-notifications";
import { retryReceiptSubmissions } from "@/core/payments/receipt-submission-service";
import { checkIntegrationHealthAlerts } from "@/core/platform/integration-alerts";

const TICK_INTERVAL_MS = 60_000;

const jobs: Array<{ name: string; run: () => Promise<number> }> = [
  { name: "expire-pending-bookings", run: expirePendingBookings },
  { name: "booking-reminders", run: sendDueBookingReminders },
  { name: "business-notifications", run: sendDueBusinessTelegramNotifications },
  { name: "receipt-processing", run: () => retryReceiptSubmissions() },
  { name: "integration-health-alerts", run: () => checkIntegrationHealthAlerts() },
];

const running = new Set<string>();

function tick() {
  for (const job of jobs) {
    if (running.has(job.name)) continue;
    running.add(job.name);
    job
      .run()
      .then((count) => process.stdout.write(`[scheduler] ${job.name}: processed ${count}\n`))
      .catch((error: unknown) => process.stderr.write(`[scheduler] ${job.name} failed: ${String(error)}\n`))
      .finally(() => running.delete(job.name));
  }
}

process.stdout.write(`[scheduler] starting, tick every ${TICK_INTERVAL_MS}ms\n`);
tick();
setInterval(tick, TICK_INTERVAL_MS);
