// A restart must not re-run yesterday's reminders, and the clocks changing
// must not move what time the reminder goes out.
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { jobs, schedules } from '../db/schema.ts';
import { closeDb, ready, reset } from '../test/helpers.ts';
import { dueSchedules, registeredSchedules, schedule } from './schedules.ts';

before(ready);
after(closeDb);
beforeEach(reset);

const queued = async () => db.select().from(jobs);
const row = async (name: string) =>
  (await db.select().from(schedules).where(eq(schedules.name, name)).limit(1))[0];

describe('a recurring job', () => {
  it('does not run the first time it is seen, it is lined up', async () => {
    schedule('test.daily', { daily: '07:00' });
    const fired = await dueSchedules(new Date('2026-06-01T09:00:00Z'));
    assert.deepEqual(fired, []);
    assert.equal((await queued()).length, 0);
    const lined = await row('test.daily');
    assert.equal(lined?.nextRunAt.toISOString(), '2026-06-02T07:00:00.000Z');
    assert.equal(lined?.lastRunAt, null);
  });

  it('runs once when its time has come, and not again on the next tick', async () => {
    schedule('test.daily', { daily: '07:00' });
    await dueSchedules(new Date('2026-06-01T09:00:00Z'));

    const morning = new Date('2026-06-02T07:00:01Z');
    assert.deepEqual(await dueSchedules(morning), ['test.daily']);
    assert.equal((await queued()).length, 1);

    // The worker goes round again a second later; nothing more should happen.
    assert.deepEqual(await dueSchedules(new Date('2026-06-02T07:00:02Z')), []);
    assert.equal((await queued()).length, 1);
    assert.equal((await row('test.daily'))?.nextRunAt.toISOString(), '2026-06-03T07:00:00.000Z');
  });

  it('queues one reminder after a weekend of downtime, not one per missed day', async () => {
    schedule('test.daily', { daily: '07:00' });
    await dueSchedules(new Date('2026-06-01T09:00:00Z'));
    // The server was off for three days and comes back on the Thursday.
    assert.deepEqual(await dueSchedules(new Date('2026-06-05T11:00:00Z')), ['test.daily']);
    assert.equal((await queued()).length, 1);
    assert.equal((await row('test.daily'))?.nextRunAt.toISOString(), '2026-06-06T07:00:00.000Z');
  });

  it('keeps to the same clock time when the clocks change', async () => {
    const { nextDailyRun } = await import('../time.ts');
    // Berlin: summer time starts on 29 March 2026. Seven in the morning stays
    // seven in the morning, which is a different instant either side.
    assert.equal(
      nextDailyRun('07:00', new Date('2026-03-28T08:00:00Z'), 'Europe/Berlin').toISOString(),
      '2026-03-29T05:00:00.000Z',
    );
    assert.equal(
      nextDailyRun('07:00', new Date('2026-03-27T08:00:00Z'), 'Europe/Berlin').toISOString(),
      '2026-03-28T06:00:00.000Z',
    );
  });

  it('lines the job up again when its time of day is changed in code', async () => {
    schedule('test.daily', { daily: '07:00' });
    await dueSchedules(new Date('2026-06-01T09:00:00Z'));
    schedule('test.daily', { daily: '18:30' });
    await dueSchedules(new Date('2026-06-01T09:05:00Z'));
    const lined = await row('test.daily');
    assert.equal(lined?.spec, 'daily:18:30');
    assert.equal(lined?.nextRunAt.toISOString(), '2026-06-01T18:30:00.000Z');
  });

  it('refuses a time of day that is not one', () => {
    assert.throws(() => schedule('test.bad', { daily: '7am' }), /07:00/);
    assert.throws(() => schedule('test.bad', { daily: '25:00' }), /07:00/);
  });

  it('ships with the due reminder declared', async () => {
    await import('./definitions.ts');
    const names = registeredSchedules().map((s) => s.name);
    assert.ok(names.includes('items.due-reminder'));
  });
});
