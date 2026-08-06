import { createAdvisoryLockSession, type AdvisoryLockSession } from "@/core/database/advisory-lock";
import { prisma } from "@/core/database/prisma";
import { errorText, logger } from "@/core/observability/logger";
import { reportError } from "@/core/observability/report-error";
import { findScheduledJob, type ScheduledJob } from "@/jobs/job-registry";

export type JobOutcome =
  | { status: "ran"; processed: number; durationMs: number }
  | { status: "locked" }
  | { status: "failed"; error: unknown; durationMs: number };

function lockName(job: string): string {
  return `manclient:job:${job}`;
}

/**
 * Runs a job only if no other process holds its lock. A `locked` outcome is normal and quiet: with
 * two instances ticking every minute, half of all ticks are expected to find the lock taken.
 */
export async function runJobExclusively(job: ScheduledJob, session: AdvisoryLockSession): Promise<JobOutcome> {
  if (!(await session.tryLock(lockName(job.name)))) {
    logger.debug("job.locked", { job: job.name });
    return { status: "locked" };
  }

  const startedAt = Date.now();
  try {
    const processed = await job.run();
    const durationMs = Date.now() - startedAt;
    // Idle sweeps are the common case and would drown the useful lines, so a no-op logs at debug.
    logger[processed > 0 ? "info" : "debug"]("job.finished", { job: job.name, processed, durationMs });
    return { status: "ran", processed, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    reportError({ event: "job.failed", error, context: { job: job.name, durationMs }, fingerprint: `job:${job.name}` });
    return { status: "failed", error, durationMs };
  } finally {
    await session.unlock(lockName(job.name)).catch((unlockError: unknown) => {
      logger.warn("job.unlock_failed", { job: job.name, error: errorText(unlockError) });
    });
  }
}

/**
 * Entry point for the `pnpm jobs:*` scripts and for cron. Takes the same lock as the scheduler, so a
 * cron-driven deployment and a leftover scheduler container cannot double-send a reminder.
 */
export async function runJobFromCli(name: string): Promise<void> {
  const job = findScheduledJob(name);
  if (!job) {
    logger.error("job.unknown", { job: name });
    process.exitCode = 1;
    return;
  }

  const session = await createAdvisoryLockSession();
  try {
    const outcome = await runJobExclusively(job, session);
    if (outcome.status === "failed") process.exitCode = 1;
    if (outcome.status === "locked") logger.info("job.skipped", { job: name, reason: "another process holds the lock" });
  } finally {
    await session.close();
    await prisma.$disconnect();
  }
}
