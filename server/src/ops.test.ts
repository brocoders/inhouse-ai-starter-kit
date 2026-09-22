// The health page has one job: say what is wrong, in words, and say nothing
// when nothing is. A page that cries wolf gets ignored, so every problem here
// is checked both ways — it appears when it should and goes away when it is
// dealt with.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { eq } from 'drizzle-orm';
import type { OpsStatus } from '../../shared/schemas.ts';
import { config } from './config.ts';
import { db } from './db/index.ts';
import { jobs, notifications, schedules } from './db/schema.ts';
import { log } from './log.ts';
import { opsStatus } from './ops.ts';
import { actAs, call, closeDb, json, makeUser, ready, reset } from './test/helpers.ts';

before(ready);
after(closeDb);
beforeEach(async () => {
  await reset();
  // The worker is not running in a test process, so its heartbeat would always
  // look stale. That case has its own test below.
  config.worker = false;
});

const codes = async (): Promise<string[]> => (await opsStatus()).problems.map((p) => p.code);

describe('when everything is fine', () => {
  it('reports no problems at all', async () => {
    const status = await opsStatus();
    assert.deepEqual(status.problems, []);
    assert.equal(status.database, 'ok');
    assert.equal(status.release, 'dev');
    assert.ok(status.schemaVersion >= 1, 'the schema version should count the migrations applied');
  });
});

describe('when something is wrong', () => {
  it('notices background work that has given up, and stops once it is cleared', async () => {
    await db.insert(jobs).values({
      id: randomUUID(),
      name: 'items.due-reminder',
      status: 'failed',
      attempts: 5,
      maxAttempts: 5,
      lastError: 'the supplier said no',
      finishedAt: new Date(),
    });
    assert.ok((await codes()).includes('jobs_failed'));
    const summary = (await opsStatus()).jobs.find((j) => j.name === 'items.due-reminder');
    assert.equal(summary?.failed24h, 1);
    assert.equal(summary?.lastError, 'the supplier said no');

    await db.delete(jobs);
    assert.equal((await codes()).includes('jobs_failed'), false);
  });

  it('ignores a failure from last week', async () => {
    await db.insert(jobs).values({
      id: randomUUID(),
      name: 'old',
      status: 'failed',
      finishedAt: new Date(Date.now() - 8 * 24 * 3_600_000),
    });
    assert.equal((await codes()).includes('jobs_failed'), false);
  });

  it('notices a regular job that has missed its slot by hours', async () => {
    await db.insert(schedules).values({
      name: 'items.due-reminder',
      spec: 'daily:07:00',
      nextRunAt: new Date(Date.now() - 3 * 3_600_000),
    });
    assert.ok((await codes()).includes('schedule_missed'));

    await db
      .update(schedules)
      .set({ nextRunAt: new Date(Date.now() + 3_600_000) })
      .where(eq(schedules.name, 'items.due-reminder'));
    assert.equal((await codes()).includes('schedule_missed'), false);
  });

  it('is not troubled by a job that is merely a little late', async () => {
    await db.insert(schedules).values({
      name: 'items.due-reminder',
      spec: 'daily:07:00',
      nextRunAt: new Date(Date.now() - 60_000),
    });
    assert.equal((await codes()).includes('schedule_missed'), false);
  });

  it('notices messages that never reached anybody', async () => {
    await db.insert(notifications).values({
      id: randomUUID(),
      subject: 'Sign in',
      status: 'failed',
      error: 'the address bounced',
    });
    assert.ok((await codes()).includes('notifications_failed'));
  });

  it('notices when there is no recent backup, once backups are set up at all', async () => {
    assert.equal(
      (await codes()).includes('backup_stale'),
      false,
      'no folder configured, no complaint',
    );
    config.backupDir = '/nowhere-at-all';
    try {
      assert.ok((await codes()).includes('backup_stale'));
    } finally {
      config.backupDir = undefined;
    }
  });

  it('notices when background work has stopped', async () => {
    config.worker = true;
    try {
      assert.ok((await codes()).includes('worker_stale'));
    } finally {
      config.worker = false;
    }
  });

  it('shows the last errors, grouped, so one bad minute is one line', async () => {
    log.error({ requestId: 'r-1' }, 'the supplier said no');
    log.error({ requestId: 'r-2' }, 'the supplier said no');
    log.error({ requestId: 'r-3' }, 'something else went wrong');
    const errors = (await opsStatus()).recentErrors;
    assert.equal(errors.length, 2);
    assert.equal(errors.find((e) => e.message === 'the supplier said no')?.count, 2);
  });
});

describe('who may look', () => {
  it('is for owners only', async () => {
    const member = await makeUser('member');
    const owner = await makeUser('owner');

    actAs(member);
    assert.equal((await call('GET', '/api/ops')).status, 403);

    actAs(owner);
    const response = await call('GET', '/api/ops');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const status = await json<OpsStatus>(response);
    assert.equal(status.database, 'ok');
  });
});
