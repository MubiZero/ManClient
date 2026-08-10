import { afterEach, describe, expect, it } from "vitest";

import { advisoryLockKey, createAdvisoryLockSession, type AdvisoryLockSession } from "@/core/database/advisory-lock";
import { SCHEDULED_JOBS } from "@/jobs/job-registry";
import { runJobExclusively } from "@/jobs/run-job";

/**
 * A rolling deploy runs two containers for a minute or two, and cron may fire `pnpm jobs:reminders`
 * next to a live scheduler. Both used to sweep the same tables at the same time. These tests pin the
 * lock that makes the second one a no-op.
 */
describe("job locking", () => {
  const sessions: AdvisoryLockSession[] = [];

  afterEach(async () => {
    await Promise.all(sessions.splice(0).map((session) => session.close()));
  });

  async function session(): Promise<AdvisoryLockSession> {
    const created = await createAdvisoryLockSession();
    sessions.push(created);
    return created;
  }

  it("hashes a job name to a stable positive key", () => {
    expect(advisoryLockKey("manclient:job:booking-reminders")).toBe(advisoryLockKey("manclient:job:booking-reminders"));
    expect(advisoryLockKey("manclient:job:booking-reminders")).not.toBe(advisoryLockKey("manclient:job:receipt-processing"));
    expect(advisoryLockKey("manclient:job:booking-reminders") > 0n).toBe(true);
  });

  it("refuses the same lock to a second connection and releases it on unlock", async () => {
    const first = await session();
    const second = await session();
    const name = `manclient:test:${crypto.randomUUID()}`;

    expect(await first.tryLock(name)).toBe(true);
    expect(await second.tryLock(name)).toBe(false);

    await first.unlock(name);
    expect(await second.tryLock(name)).toBe(true);
  });

  it("skips a job whose lock another process holds, instead of running it twice", async () => {
    const holder = await session();
    const runner = await session();
    let runs = 0;
    const job = { name: `test-${crypto.randomUUID()}`, run: async () => { runs += 1; return 0; } };

    expect(await holder.tryLock(`manclient:job:${job.name}`)).toBe(true);
    await expect(runJobExclusively(job, runner)).resolves.toEqual({ status: "locked" });
    expect(runs).toBe(0);

    await holder.unlock(`manclient:job:${job.name}`);
    await expect(runJobExclusively(job, runner)).resolves.toMatchObject({ status: "ran", processed: 0 });
    expect(runs).toBe(1);
  });

  it("releases the lock after a job throws, so the next tick can retry", async () => {
    const runner = await session();
    const other = await session();
    const name = `test-${crypto.randomUUID()}`;
    const job = { name, run: async () => { throw new Error("job exploded"); } };

    await expect(runJobExclusively(job, runner)).resolves.toMatchObject({ status: "failed" });
    expect(await other.tryLock(`manclient:job:${name}`)).toBe(true);
  });

  it("registers every job the scheduler and the CLI scripts share", () => {
    expect(SCHEDULED_JOBS.map((job) => job.name)).toEqual([
      "expire-pending-bookings",
      "booking-reminders",
      "business-notifications",
      "receipt-processing",
      "integration-health-alerts",
      "security-maintenance",
      "subscription-lifecycle",
      "data-retention",
    ]);
  });

  it("keeps housekeeping on its own interval instead of every tick", () => {
    // Delivery jobs must run as often as the scheduler ticks; a sweep of months-old rows asking the same
    // question sixty times an hour is noise in the logs and load on the database for nothing.
    const byName = new Map(SCHEDULED_JOBS.map((job) => [job.name, job]));
    expect(byName.get("data-retention")?.intervalMs).toBe(60 * 60_000);
    expect(byName.get("subscription-lifecycle")?.intervalMs).toBe(60 * 60_000);
    expect(byName.get("booking-reminders")?.intervalMs).toBeUndefined();
  });
});
