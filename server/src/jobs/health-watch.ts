// The health page, pushed. The page shows only what is wrong, but nobody
// opens it on the day it matters; this job reads the same list every fifteen
// minutes and tells each owner, once, about a problem that has stayed.
//
// Stayed means seen on two runs in a row: a backup that is a minute late or
// a worker still starting is not worth an e-mail. Nothing is sent on the
// first run after a start, so a restart does not cry wolf. When a problem
// goes away its key is resolved, so the next time it happens it is told
// again — and the owner is not told again while it merely continues.
import { and, eq } from 'drizzle-orm';
import { config } from '../config.ts';
import { db, type Db } from '../db/index.ts';
import { user } from '../db/schema.ts';
import { notify, resolveNotice } from '../notify/index.ts';
import type { Problem } from '../../../shared/schemas.ts';
import { schedule } from './schedules.ts';
import { defineJob } from './worker.ts';

export const HEALTH_WATCH = 'health.watch';
export const HEALTH_KEY = 'health';

// What the previous run saw; null until there has been one.
let previous: Set<string> | null = null;

/** Forget the previous run — for tests, and for anyone restarting the watch. */
export function resetHealthWatch(): void {
  previous = null;
}

const keyFor = (code: string, userId: string) => `${HEALTH_KEY}:${code}:${userId}`;

/**
 * One run over a problem list. Returns the codes the owners were told about
 * this time (a code already told is skipped by its key, so it is not here).
 */
export async function watchHealth(problems: Problem[], database: Db = db): Promise<string[]> {
  const current = new Set(problems.map((problem) => problem.code));
  const seenBefore = previous;
  previous = current;
  if (seenBefore === null) return [];

  const owners = await database
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, 'owner'), eq(user.active, true)));

  for (const code of seenBefore) {
    if (current.has(code)) continue;
    for (const owner of owners) await resolveNotice(keyFor(code, owner.id), database);
  }

  const told: string[] = [];
  for (const problem of problems) {
    if (!seenBefore.has(problem.code)) continue;
    let sentToSomebody = false;
    for (const owner of owners) {
      const result = await notify(
        {
          userId: owner.id,
          key: keyFor(problem.code, owner.id),
          subject: `${config.appName}: something needs your attention`,
          text: [
            problem.message,
            '',
            `This has been so for at least a quarter of an hour. You will not be told again until it has cleared and come back.`,
            '',
            `${config.appUrl}/system`,
          ].join('\n'),
        },
        undefined,
        database,
      );
      if (result.status === 'sent' || result.status === 'queued') sentToSomebody = true;
    }
    if (sentToSomebody) told.push(problem.code);
  }
  return told;
}

defineJob(HEALTH_WATCH, async (_payload, context) => {
  // Imported here, not at the top: ops.ts reads the worker's heartbeat, and
  // the worker is what loads this file.
  const { opsStatus } = await import('../ops.ts');
  const status = await opsStatus();
  const told = await watchHealth(status.problems);
  context.log.info({ problems: status.problems.length, told }, 'health watched');
});

schedule(HEALTH_WATCH, { everyMinutes: 15 });
