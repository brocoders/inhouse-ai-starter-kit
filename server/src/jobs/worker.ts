// The loop that runs background work. It lives inside the app process — one
// less thing to deploy — and `WORKER=off` turns it off on a machine that
// should only serve requests.
//
// The rule this file exists to keep: one failing job never stops the worker.
// A handler that throws, a handler that does not exist, a database hiccup in
// the middle of a tick — each is written down and the loop goes round again.
import { randomUUID } from 'node:crypto';
import { db, type Db } from '../db/index.ts';
import type { JobRow } from '../db/schema.ts';
import { log } from '../log.ts';
import { claim, heartbeat, markDone, markFailed, releaseExpired } from './queue.ts';
import { dueSchedules } from './schedules.ts';

export type JobContext = { jobId: string; attempt: number; log: typeof log };
export type JobHandler = (
  payload: Record<string, unknown>,
  context: JobContext,
) => Promise<void> | void;

const handlers = new Map<string, JobHandler>();

export function defineJob(name: string, handler: JobHandler): void {
  handlers.set(name, handler);
}

export function definedJobs(): string[] {
  return [...handlers.keys()].sort();
}

export type WorkerOptions = {
  /** How long a job may hold its lease before another worker may take it. */
  leaseMs?: number;
  /** How long to wait when there was nothing to do. */
  idleMs?: number;
  /** First retry wait; it doubles on every attempt, up to an hour. */
  backoffMs?: number;
  database?: Db;
};

const DEFAULTS = { leaseMs: 5 * 60_000, idleMs: 1_000, backoffMs: 30_000 };
const MAX_BACKOFF_MS = 60 * 60_000;

export const backoffFor = (attempt: number, base: number): number =>
  Math.min(base * 2 ** Math.max(0, attempt - 1), MAX_BACKOFF_MS);

let lastTick: Date | undefined;

/** When the worker last went round. The health page complains if it is stale. */
export function workerHeartbeat(): Date | undefined {
  return lastTick;
}

async function run(
  job: JobRow,
  options: Required<Omit<WorkerOptions, 'database'>>,
  database: Db,
): Promise<void> {
  const handler = handlers.get(job.name);
  if (!handler) {
    await markFailed(
      job,
      `no handler is registered for "${job.name}"`,
      backoffFor(job.attempts, options.backoffMs),
      database,
    );
    log.error({ jobId: job.id, job: job.name }, `job has no handler: ${job.name}`);
    return;
  }
  // A job that outlives its lease would be picked up twice, so push the lease
  // out while it is still working.
  const keepAlive = setInterval(
    () => {
      void heartbeat(job.id, options.leaseMs, database).catch(() => {});
    },
    Math.max(1_000, Math.floor(options.leaseMs / 3)),
  );
  keepAlive.unref?.();
  try {
    await handler((job.payload ?? {}) as Record<string, unknown>, {
      jobId: job.id,
      attempt: job.attempts,
      log: log.child({ jobId: job.id, job: job.name }),
    });
    await markDone(job.id, database);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await markFailed(job, reason, backoffFor(job.attempts, options.backoffMs), database);
    log.error({ jobId: job.id, job: job.name, err: error }, `job failed: ${reason}`);
  } finally {
    clearInterval(keepAlive);
  }
}

/**
 * The housekeeping before a claim, one step at a time. Each step is on its own
 * because each can fail on its own — one schedule row that cannot be read, a
 * lease update that hits a lock — and a failure in either used to throw out of
 * the whole tick, every tick, so nothing already queued was ever claimed. The
 * step is written down and the tick carries on to the work.
 */
async function housekeeping(step: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    log.error(
      { err: error, step },
      `the job worker could not ${step} and carried on: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** One turn of the loop. Returns whether there was anything to do. */
export async function tick(options: WorkerOptions = {}): Promise<boolean> {
  const settings = { ...DEFAULTS, ...options };
  const database = options.database ?? db;
  lastTick = new Date();
  await housekeeping('release expired leases', () => releaseExpired(database));
  await housekeeping('queue due schedules', () => dueSchedules(new Date(), database));
  const job = await claim(randomUUID(), settings.leaseMs, database);
  if (!job) return false;
  await run(job, settings, database);
  return true;
}

export type Worker = { stop: () => Promise<void> };

export function startWorker(options: WorkerOptions = {}): Worker {
  const settings = { ...DEFAULTS, ...options };
  let running = true;
  let current: Promise<unknown> = Promise.resolve();
  let wake: (() => void) | undefined;

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      timer.unref?.();
      wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });

  const loop = async () => {
    while (running) {
      try {
        current = tick(options);
        const did = await current;
        if (!did) await sleep(settings.idleMs);
      } catch (error) {
        // Whatever went wrong — the database, a bug in this file — the loop
        // keeps going. Stopping it would silently stop every scheduled job.
        log.error({ err: error }, `the job worker hit a problem and carried on: ${String(error)}`);
        await sleep(settings.idleMs);
      }
    }
  };

  const finished = loop();

  return {
    async stop() {
      running = false;
      wake?.();
      // Let the job in flight finish; it holds a lease nobody else can take.
      await current.catch(() => {});
      await finished;
    },
  };
}
