import { expireStalePhoneVerifications } from "@/core/security/phone-verification-service";
import { deleteExpiredRateLimitCounters } from "@/core/security/rate-limit";

/**
 * Both tables are write-heavy and read-never once their window closes. Sweeping them together keeps
 * the job list short and means neither can be the one nobody remembered to schedule.
 */
export async function runSecurityMaintenance(now = new Date()): Promise<number> {
  const [verifications, counters] = await Promise.all([expireStalePhoneVerifications(now), deleteExpiredRateLimitCounters(now)]);
  return verifications + counters;
}
