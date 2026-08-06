import { createHash } from "node:crypto";

import { Client } from "pg";

/**
 * Mutual exclusion for the background jobs, so a second web instance or a stray cron invocation
 * cannot run the same sweep at the same time. Postgres already holds the data, so it holds the lock
 * too — no Redis, no lease table to garbage-collect, and a crashed holder releases automatically
 * when its connection dies.
 *
 * This deliberately uses its own `pg` connection instead of Prisma. Session-level advisory locks
 * belong to the connection that took them, and Prisma's pool is free to answer the unlock on a
 * different connection than the lock — which silently leaks the lock until the process exits. The
 * alternative, `pg_try_advisory_xact_lock` inside an interactive transaction, would hold a
 * transaction open for the whole job and is capped by Prisma's transaction timeout.
 */

export type AdvisoryLockSession = {
  tryLock: (name: string) => Promise<boolean>;
  unlock: (name: string) => Promise<void>;
  close: () => Promise<void>;
};

/** Advisory lock keys are bigints; the name is hashed into a stable, positive 63-bit integer. */
export function advisoryLockKey(name: string): bigint {
  const digest = createHash("sha1").update(name).digest();
  return digest.readBigUInt64BE(0) & 0x7fff_ffff_ffff_ffffn;
}

export async function createAdvisoryLockSession(connectionString = process.env.DATABASE_URL): Promise<AdvisoryLockSession> {
  if (!connectionString) throw new Error("DATABASE_URL is required to take advisory locks");
  const client = new Client({ connectionString });
  await client.connect();
  const held = new Set<string>();

  // All jobs tick at once and share this one connection, so their lock queries have to be serialized:
  // `pg` deprecates overlapping queries on a single client and drops support for them in pg@9. The
  // queries are two-microsecond index-free lookups, so a queue costs nothing measurable.
  let pending: Promise<unknown> = Promise.resolve();
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation, operation);
    pending = result.catch(() => undefined);
    return result;
  }

  return {
    async tryLock(name) {
      const key = advisoryLockKey(name).toString();
      const locked = await serialize(async () => {
        const result = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1::bigint) AS locked", [key]);
        return result.rows[0]?.locked === true;
      });
      if (locked) held.add(name);
      return locked;
    },
    async unlock(name) {
      if (!held.delete(name)) return;
      const key = advisoryLockKey(name).toString();
      await serialize(() => client.query("SELECT pg_advisory_unlock($1::bigint)", [key]));
    },
    async close() {
      held.clear();
      await serialize(() => client.end());
    },
  };
}
