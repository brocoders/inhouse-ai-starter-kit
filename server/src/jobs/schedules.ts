// Recurring work, declared in code next to the job it runs, and remembered in
// the `schedules` table so a restart does not run everything again.
//
// "Daily at 07:00" means seven in the morning where the app lives — the time
// zone in the settings — not seven o'clock UTC. On the morning the clocks go
// forward it still runs once, at the first seven-o'clock that exists.
//
// "Every fifteen minutes" is the other shape — a mirror of some device, a
// check on a balance, a sender for the outbox. It counts from the moment the
// last run was queued, not from the top of the hour, so nothing lines up on
// the minute with every other job on every other machine.
//
// This is deliberately not cron. Daily at a time, or every so many minutes,
// is what these apps need; the day something needs "every second Tuesday",
// write that case rather than a cron parser nobody can read.
import { eq, notInArray } from 'drizzle-orm';
import { db, type Db } from '../db/index.ts';
import { schedules } from '../db/schema.ts';
import { log } from '../log.ts';
import { nextDailyRun } from '../time.ts';
import { enqueue } from './queue.ts';

export type Spec = { daily: string } | { everyMinutes: number };

const MINUTE_MS = 60_000;
const MAX_EVERY_MINUTES = 24 * 60;

const registered = new Map<string, Spec>();

export function schedule(name: string, spec: Spec): void {
  if ('daily' in spec) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(spec.daily)) {
      throw new Error(
        `the schedule "${name}" needs a time of day like "07:00", not "${spec.daily}"`,
      );
    }
  } else if (
    !Number.isInteger(spec.everyMinutes) ||
    spec.everyMinutes < 1 ||
    spec.everyMinutes > MAX_EVERY_MINUTES
  ) {
    throw new Error(
      `the schedule "${name}" needs a whole number of minutes from 1 to ${MAX_EVERY_MINUTES}, not "${String(spec.everyMinutes)}"; for once a day or less, use { daily: "07:00" }`,
    );
  }
  registered.set(name, spec);
}

export function registeredSchedules(): { name: string; spec: Spec }[] {
  return [...registered].map(([name, spec]) => ({ name, spec }));
}

export const specText = (spec: Spec): string =>
  'daily' in spec ? `daily:${spec.daily}` : `every:${spec.everyMinutes}m`;

/** The next moment this schedule should run, counted from `now`. */
export function nextRun(spec: Spec, now: Date): Date {
  if ('daily' in spec) return nextDailyRun(spec.daily, now);
  return new Date(now.getTime() + spec.everyMinutes * MINUTE_MS);
}

// Databases whose retired schedules have been cleared this process. Once is
// enough: the set of schedules is fixed when the code loads.
const tidied = new WeakSet<object>();

/**
 * Forget schedules whose job the code no longer declares.
 *
 * A row outlives the job that made it — the worked example's reminder is the
 * first one every app deletes — and a row with no job is never run, so the
 * health page warned "due and had not run" for ever on the first real app
 * built from the kit. The row goes; the job's past runs stay in `jobs`.
 */
export async function retireUnknownSchedules(database: Db = db): Promise<void> {
  const known = [...registered.keys()];
  const stale = known.length
    ? await database.delete(schedules).where(notInArray(schedules.name, known)).returning()
    : await database.delete(schedules).returning();
  for (const row of stale) log.info({ job: row.name }, 'schedule retired: no job declares it');
}

/**
 * Run every schedule whose moment has passed, and write down the next one.
 *
 * The next run is computed from `now`, not from the time it was meant to run,
 * so a server that was off for two days queues one reminder when it comes
 * back rather than two.
 */
export async function dueSchedules(now: Date = new Date(), database: Db = db): Promise<string[]> {
  if (!tidied.has(database)) {
    // Marked only once it has worked: a database still coming up after the
    // switch gets another go on the next tick rather than never.
    await retireUnknownSchedules(database);
    tidied.add(database);
  }
  const fired: string[] = [];
  for (const [name, spec] of registered) {
    const [row] = await database.select().from(schedules).where(eq(schedules.name, name)).limit(1);
    if (!row) {
      // First time we have seen this schedule: line it up, do not run it now.
      await database
        .insert(schedules)
        .values({ name, spec: specText(spec), nextRunAt: nextRun(spec, now) });
      continue;
    }
    if (row.spec !== specText(spec)) {
      await database
        .update(schedules)
        .set({ spec: specText(spec), nextRunAt: nextRun(spec, now) })
        .where(eq(schedules.name, name));
      continue;
    }
    if (row.nextRunAt.getTime() > now.getTime()) continue;

    await enqueue(name, {}, {}, database);
    await database
      .update(schedules)
      .set({ lastRunAt: now, nextRunAt: nextRun(spec, now) })
      .where(eq(schedules.name, name));
    log.info({ job: name }, 'scheduled job queued');
    fired.push(name);
  }
  return fired;
}
