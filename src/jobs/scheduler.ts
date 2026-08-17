import "@/core/config/load-env-file";

import { createAdvisoryLockSession } from "@/core/database/advisory-lock";
import { prisma } from "@/core/database/prisma";
import { logger } from "@/core/observability/logger";
import { SCHEDULED_JOBS } from "@/jobs/job-registry";
import { runJobExclusively } from "@/jobs/run-job";

/**
 * The delivery loop. Every job is idempotent and claims its own rows, so correctness never depended
 * on there being exactly one scheduler — but throughput and log noise did, and an unlocked sweep of
 * the whole table from two instances is wasted database work on every tick. Each job now runs under a
 * Postgres advisory lock, so a rolling deploy with two live containers behaves like one.
 *
 * A failing job backs off instead of retrying every minute: an unreachable payom gateway used to
 * produce sixty identical failures an hour.
 */

const TICK_INTERVAL_MS = 60_000;
const BASE_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 15 * 60_000;
const SHUTDOWN_GRACE_MS = 30_000;

type JobState = { running: boolean; failures: number; nextRunAt: number };

const state = new Map<string, JobState>(SCHEDULED_JOBS.map((job) => [job.name, { running: false, failures: 0, nextRunAt: 0 }]));

function backoffMs(failures: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** (failures - 1), MAX_BACKOFF_MS);
}

async function main(): Promise<void> {
  const session = await createAdvisoryLockSession();
  logger.info("scheduler.started", { tickIntervalMs: TICK_INTERVAL_MS, jobs: SCHEDULED_JOBS.map((job) => job.name) });

  function tick(): void {
    const now = Date.now();
    for (const job of SCHEDULED_JOBS) {
      const current = state.get(job.name);
      if (!current || current.running || now < current.nextRunAt) continue;
      current.running = true;

      void runJobExclusively(job, session)
        .then((outcome) => {
          if (outcome.status === "failed") {
            current.failures += 1;
            const delay = backoffMs(current.failures);
            current.nextRunAt = Date.now() + delay;
            logger.warn("scheduler.backing_off", { job: job.name, failures: current.failures, retryInMs: delay });
            return;
          }
          current.failures = 0;
          current.nextRunAt = job.intervalMs ? Date.now() + job.intervalMs : 0;
        })
        .finally(() => {
          current.running = false;
        });
    }
  }

  tick();
  const timer = setInterval(tick, TICK_INTERVAL_MS);

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(timer);
    logger.info("scheduler.stopping", { signal });

    // Waits for jobs that are mid-flight: killing the process between "claimed PROCESSING" and
    // "marked SENT" is what leaves a message stuck in PROCESSING with nobody coming back for it.
    void (async () => {
      const deadline = Date.now() + SHUTDOWN_GRACE_MS;
      while (Date.now() < deadline && [...state.values()].some((job) => job.running)) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      const stillRunning = [...state.entries()].filter(([, job]) => job.running).map(([name]) => name);
      if (stillRunning.length) logger.warn("scheduler.forced_exit", { stillRunning });
      await session.close().catch(() => undefined);
      await prisma.$disconnect().catch(() => undefined);
      logger.info("scheduler.stopped", { signal });
      process.exit(0);
    })();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

void main().catch((error: unknown) => {
  logger.error("scheduler.crashed", { error: error instanceof Error ? error.stack : String(error) });
  process.exit(1);
});
