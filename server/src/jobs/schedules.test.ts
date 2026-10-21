// A restart must not re-run yesterday's reminders, and the clocks changing
// must not move what time the reminder goes out.
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { jobs, schedules } from '../db/schema.ts';
import { closeDb, ready, reset } from '../test/helpers.ts';
import {
  dueSchedules,
  registeredSchedules,
  retireUnknownSchedules,
  schedule,
} from './schedules.ts';

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

  it('forgets a schedule whose job the code no longer declares', async () => {
    // The row a deleted job leaves behind: lined up, never run, and with no
    // code to run it the health page would call it late for ever.
    schedule('test.daily', { daily: '07:00' });
    await dueSchedules(new Date('2026-06-01T09:00:00Z'));
    await db.insert(schedules).values({
      name: 'test.retired',
      spec: 'daily:07:00',
      nextRunAt: new Date('2026-06-01T07:00:00Z'),
    });
    await retireUnknownSchedules(db);
    assert.equal(await row('test.retired'), undefined);
    assert.notEqual(await row('test.daily'), undefined);
  });
});

describe('a job every so many minutes', () => {
  it('is lined up one interval ahead the first time it is seen, not run at once', async () => {
    schedule('test.every', { everyMinutes: 15 });
    const fired = await dueSchedules(new Date('2026-06-01T09:00:00Z'));
    assert.deepEqual(fired, []);
    assert.equal((await queued()).length, 0);
    const lined = await row('test.every');
    assert.equal(lined?.spec, 'every:15m');
    assert.equal(lined?.nextRunAt.toISOString(), '2026-06-01T09:15:00.000Z');
  });

  it('runs when its interval has passed, once, and lines up the next from then', async () => {
    schedule('test.every', { everyMinutes: 15 });
    await dueSchedules(new Date('2026-06-01T09:00:00Z'));
    assert.deepEqual(await dueSchedules(new Date('2026-06-01T09:14:59Z')), []);
    assert.deepEqual(await dueSchedules(new Date('2026-06-01T09:15:30Z')), ['test.every']);
    assert.equal((await queued()).length, 1);
    assert.deepEqual(await dueSchedules(new Date('2026-06-01T09:15:31Z')), []);
    assert.equal((await queued()).length, 1);
    assert.equal((await row('test.every'))?.nextRunAt.toISOString(), '2026-06-01T09:30:30.000Z');
  });

  it('runs once after an hour of downtime, not four times', async () => {
    schedule('test.every', { everyMinutes: 15 });
    await dueSchedules(new Date('2026-06-01T09:00:00Z'));
    assert.deepEqual(await dueSchedules(new Date('2026-06-01T10:00:00Z')), ['test.every']);
    assert.equal((await queued()).length, 1);
    assert.equal((await row('test.every'))?.nextRunAt.toISOString(), '2026-06-01T10:15:00.000Z');
  });

  it('lines the job up again when its interval is changed in code', async () => {
    schedule('test.every', { everyMinutes: 15 });
    await dueSchedules(new Date('2026-06-01T09:00:00Z'));
    schedule('test.every', { everyMinutes: 5 });
    await dueSchedules(new Date('2026-06-01T09:01:00Z'));
    const lined = await row('test.every');
    assert.equal(lined?.spec, 'every:5m');
    assert.equal(lined?.nextRunAt.toISOString(), '2026-06-01T09:06:00.000Z');
  });

  it('can switch between the two shapes', async () => {
    schedule('test.shape', { daily: '07:00' });
    await dueSchedules(new Date('2026-06-01T09:00:00Z'));
    schedule('test.shape', { everyMinutes: 30 });
    await dueSchedules(new Date('2026-06-01T09:01:00Z'));
    assert.equal((await row('test.shape'))?.nextRunAt.toISOString(), '2026-06-01T09:31:00.000Z');
  });

  it('refuses an interval that is not a whole number of minutes in a day', () => {
    assert.throws(() => schedule('test.bad', { everyMinutes: 0 }), /1 to 1440/);
    assert.throws(() => schedule('test.bad', { everyMinutes: 2.5 }), /whole number/);
    assert.throws(() => schedule('test.bad', { everyMinutes: 1441 }), /daily/);
  });
});
