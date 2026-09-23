// Work that happens later, or elsewhere, lives in a table. No Redis, no
// broker: for an app this size a row with a status and a run time is the whole
// mechanism, and it is backed up and restored with everything else.
import { randomUUID } from 'node:crypto';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { db, type Db } from '../db/index.ts';
import { jobs, type JobRow } from '../db/schema.ts';

export type EnqueueOptions = {
  /** When it should first run. The default is now. */
  runAt?: Date | undefined;
  /** How many times to try before giving up. */
  maxAttempts?: number | undefined;
};

export async function enqueue(
  name: string,
  payload: Record<string, unknown> = {},
  options: EnqueueOptions = {},
  database: Db = db,
): Promise<string> {
  const id = randomUUID();
  await database.insert(jobs).values({
    id,
    name,
    payload,
    runAt: options.runAt ?? new Date(),
    maxAttempts: options.maxAttempts ?? 5,
    status: 'queued',
  });
  return id;
}

/**
 * Take the next job that is due, and take it exactly once.
 *
 * `for update skip locked` is what makes that true: the row is locked while it
 * is picked, and a second worker asking at the same moment steps over it
 * rather than waiting or taking it twice. The lease — `locked_until` — is the
 * second half: if the process holding a job dies, the job comes back on its
 * own instead of staying "running" forever.
 *
 * PGlite has a single connection, so the tests here can prove that a claim
 * works, that a lease expires and that a crashed job returns — but not that
 * two workers never collide. That one is only provable against real
 * PostgreSQL, which is what the `TEST_POSTGRES=1` run is for.
 */
export async function claim(
  workerId: string,
  leaseMs: number,
  database: Db = db,
): Promise<JobRow | undefined> {
  const [row] = await database
    .update(jobs)
    .set({
      status: 'running',
      lockedBy: workerId,
      lockedUntil: new Date(Date.now() + leaseMs),
      attempts: sql`${jobs.attempts} + 1`,
    })
    .where(
      sql`${jobs.id} = (
        select id from ${jobs}
        where status = 'queued' and run_at <= now()
        order by run_at asc, created_at asc
        limit 1
        for update skip locked
      )`,
    )
    .returning();
  return row;
}

/** Keep a long job's lease alive so nobody else picks it up mid-run. */
export async function heartbeat(id: string, leaseMs: number, database: Db = db): Promise<void> {
  await database
    .update(jobs)
    .set({ lockedUntil: new Date(Date.now() + leaseMs) })
    .where(eq(jobs.id, id));
}

export async function markDone(id: string, database: Db = db): Promise<void> {
  await database
    .update(jobs)
    .set({
      status: 'done',
      finishedAt: new Date(),
      lockedUntil: null,
      lockedBy: null,
      lastError: null,
    })
    .where(eq(jobs.id, id));
}

/** Put it back for another go, or write it off if it has had enough. */
export async function markFailed(
  job: JobRow,
  reason: string,
  backoffMs: number,
  database: Db = db,
): Promise<void> {
  const exhausted = job.attempts >= job.maxAttempts;
  await database
    .update(jobs)
    .set({
      status: exhausted ? 'failed' : 'queued',
      lastError: reason.slice(0, 1000),
      lockedUntil: null,
      lockedBy: null,
      runAt: exhausted ? job.runAt : new Date(Date.now() + backoffMs),
      finishedAt: exhausted ? new Date() : null,
    })
    .where(eq(jobs.id, job.id));
}

/**
 * Jobs whose worker went away. Their lease ran out, so they are free again —
 * unless that was their last try.
 *
 * The claim already counted the attempt, so a lease that runs out is that
 * attempt failing, exactly as if the handler had thrown. Without the ceiling a
 * job that hangs, or that takes the process down with it, would come back
 * forever and be retried every few minutes for as long as the server runs.
 */
export async function releaseExpired(database: Db = db): Promise<number> {
  const now = new Date();
  const expired = and(eq(jobs.status, 'running'), lt(jobs.lockedUntil, now));
  const given = await database
    .update(jobs)
    .set({
      status: 'failed',
      lockedUntil: null,
      lockedBy: null,
      lastError: 'the worker stopped mid-run, and that was the last try',
      finishedAt: now,
    })
    .where(and(expired, gte(jobs.attempts, jobs.maxAttempts)))
    .returning({ id: jobs.id });
  const requeued = await database
    .update(jobs)
    .set({
      status: 'queued',
      lockedUntil: null,
      lockedBy: null,
      lastError: 'the worker stopped mid-run',
    })
    .where(and(expired, lt(jobs.attempts, jobs.maxAttempts)))
    .returning({ id: jobs.id });
  return given.length + requeued.length;
}
