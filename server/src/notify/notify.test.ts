// Every message is written down whether or not it went out, because "did they
// ever get told?" is a question somebody asks weeks later.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, describe, it } from 'node:test';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { notifications } from '../db/schema.ts';
import { closeDb, makeUser, ready, reset } from '../test/helpers.ts';
import { notify, resolveNotice, retryQueued } from './index.ts';
import { HEALTH_WATCH, resetHealthWatch, watchHealth } from '../jobs/health-watch.ts';
import type { Problem } from '../../../shared/schemas.ts';
import { lastOutboxMessage, type Channel } from './email.ts';
import { DUE_REMINDER } from '../jobs/definitions.ts';
import { items } from '../db/schema.ts';
import { randomUUID } from 'node:crypto';
import { addDays, calendarDay } from '../time.ts';
import { enqueue } from '../jobs/queue.ts';
import { tick } from '../jobs/worker.ts';

before(ready);
after(closeDb);
beforeEach(reset);

const readRow = async (id: string) =>
  (await db.select().from(notifications).where(eq(notifications.id, id)).limit(1))[0];

describe('telling somebody something', () => {
  it('writes the message to a file when there is no mail account yet', async () => {
    const person = await makeUser('member', { email: 'reader@example.com' });
    const sent = await notify({ userId: person.id, subject: 'Hello', text: 'Some words' });

    assert.equal(sent.status, 'sent');
    const row = await readRow(sent.id);
    assert.equal(row?.status, 'sent');
    assert.equal(row?.channel, 'email');
    assert.ok(row?.sentAt);

    const written = lastOutboxMessage();
    assert.ok(written);
    const onDisk = await readFile(written.file, 'utf8');
    assert.match(onDisk, /To: reader@example.com/);
    assert.match(onDisk, /Subject: Hello/);
    assert.match(onDisk, /Some words/);
  });

  it('records the reason when sending fails, rather than losing it', async () => {
    const refusing: Channel = {
      name: 'email',
      send: async () => {
        throw new Error('the mail provider refused the address');
      },
    };
    const sent = await notify({ email: 'nobody@example.com', subject: 'Hi', text: 'x' }, refusing);
    // Not lost: kept for another try, with the reason beside it.
    assert.equal(sent.status, 'queued');
    const row = await readRow(sent.id);
    assert.equal(row?.status, 'queued');
    assert.equal(row?.error, 'the mail provider refused the address');
    assert.equal(row?.sentAt, null);
  });

  it('fails plainly when there is nobody to send to', async () => {
    const sent = await notify({ subject: 'Hi', text: 'x' });
    assert.equal(sent.status, 'failed');
    assert.match((await readRow(sent.id))?.error ?? '', /no address/);
  });
});

describe('the daily reminder', () => {
  it('sends each person one message listing everything of theirs that is late', async () => {
    const one = await makeUser('member', { email: 'one@example.com', name: 'One' });
    const two = await makeUser('member', { email: 'two@example.com', name: 'Two' });
    const off = await makeUser('member', { email: 'off@example.com', active: false });
    const today = calendarDay();
    const now = new Date();

    const item = (
      title: string,
      dueOn: string | null,
      assigneeId: string | null,
      status: 'open' | 'done' = 'open',
    ) => ({
      id: randomUUID(),
      title,
      status,
      dueOn,
      assigneeId,
      createdAt: now,
      updatedAt: now,
    });
    await db
      .insert(items)
      .values([
        item('Late one', addDays(today, -3), one.id),
        item('Late two', addDays(today, -1), one.id),
        item('Late for the other person', addDays(today, -2), two.id),
        item('Not late', addDays(today, 3), one.id),
        item('Late but finished', addDays(today, -4), one.id, 'done'),
        item('Late but nobody is on it', addDays(today, -4), null),
        item('Late for somebody turned off', addDays(today, -4), off.id),
      ]);

    await enqueue(DUE_REMINDER);
    assert.equal(await tick(), true);

    const rows = await db.select().from(notifications);
    assert.equal(rows.length, 2, 'one message each, not one per item');
    const forOne = rows.find((row) => row.userId === one.id);
    assert.match(forOne?.subject ?? '', /2 overdue items/);
    assert.equal(forOne?.status, 'sent');
    const forTwo = rows.find((row) => row.userId === two.id);
    assert.match(forTwo?.subject ?? '', /1 overdue item/);
  });
});

describe('the outbox', () => {
  const flaky = (failTimes: number): Channel & { calls: number } => {
    const channel = {
      name: 'email',
      calls: 0,
      async send() {
        channel.calls += 1;
        if (channel.calls <= failTimes) throw new Error('the mail provider timed out');
      },
    };
    return channel;
  };

  it('keeps a message that could not be sent and sends it on a later try', async () => {
    const channel = flaky(1);
    const first = await notify({ email: 'late@example.com', subject: 'Hi', text: 'x' }, channel);
    assert.equal(first.status, 'queued');
    const row = await readRow(first.id);
    assert.equal(row?.status, 'queued');
    assert.equal(row?.attempts, 1);
    assert.equal(row?.address, 'late@example.com');
    assert.equal(row?.text, 'x');
    assert.ok(row?.nextAttemptAt && row.nextAttemptAt.getTime() > Date.now() + 30_000);

    // Too early: nothing happens.
    assert.equal(await retryQueued(new Date(), channel), 0);
    assert.equal(channel.calls, 1);
    // The wait is over: sent.
    assert.equal(await retryQueued(new Date(Date.now() + 2 * 60_000), channel), 1);
    const sent = await readRow(first.id);
    assert.equal(sent?.status, 'sent');
    assert.equal(sent?.attempts, 2);
    assert.ok(sent?.sentAt);
    assert.equal(sent?.error, null);
  });

  it('gives up after five tries and the health page counts it then, not before', async () => {
    const channel = flaky(99);
    const first = await notify({ email: 'never@example.com', subject: 'Hi', text: 'x' }, channel);
    assert.equal(first.status, 'queued');
    let at = Date.now();
    for (let round = 2; round <= 4; round += 1) {
      at += 60 * 60_000;
      await retryQueued(new Date(at), channel);
      assert.equal((await readRow(first.id))?.status, 'queued', `still waiting after try ${round}`);
    }
    at += 60 * 60_000;
    await retryQueued(new Date(at), channel);
    const row = await readRow(first.id);
    assert.equal(row?.status, 'failed');
    assert.equal(row?.attempts, 5);
    assert.equal(row?.nextAttemptAt, null);
    assert.match(row?.error ?? '', /timed out/);
    assert.equal(channel.calls, 5);
    // No sixth try, however long it waits.
    assert.equal(await retryQueued(new Date(at + 24 * 60 * 60_000), channel), 0);
    assert.equal(channel.calls, 5);
  });

  it('tells a keyed message once, and again only after the key is resolved', async () => {
    const person = await makeUser('owner', { email: 'boss@example.com' });
    const message = { userId: person.id, key: 'stock:low', subject: 'Low stock', text: 'x' };
    assert.equal((await notify(message)).status, 'sent');
    const again = await notify(message);
    assert.equal(again.status, 'skipped');
    assert.equal((await readRow(again.id))?.status, 'skipped');

    await resolveNotice('stock:low');
    assert.equal((await notify(message)).status, 'sent');
    const rows = await db.select().from(notifications);
    assert.equal(rows.filter((row) => row.status === 'sent').length, 2);
    assert.equal(rows.filter((row) => row.status === 'skipped').length, 1);
  });

  it('does not let a message that gave up block the next one with the same key', async () => {
    const refusing = flaky(99);
    const first = await notify(
      { email: 'x@example.com', key: 'k', subject: 'a', text: 'x' },
      refusing,
    );
    assert.equal(first.status, 'queued');
    // Waiting counts as told; nobody gets the same alarm twice while it retries.
    assert.equal(
      (await notify({ email: 'x@example.com', key: 'k', subject: 'a', text: 'x' }, refusing))
        .status,
      'skipped',
    );
    await db.update(notifications).set({ status: 'failed' }).where(eq(notifications.id, first.id));
    assert.equal(
      (await notify({ email: 'x@example.com', key: 'k', subject: 'a', text: 'x' })).status,
      'sent',
    );
  });
});

describe('problems that reach the owner', () => {
  const problem = (code: string): Problem => ({
    code,
    severity: 'error',
    message: `Something about ${code}.`,
    since: null,
    href: null,
  });
  const sentSubjects = async () =>
    (await db.select().from(notifications)).filter((row) => row.status === 'sent');

  it('tells every active owner once about a problem that stays, and nobody about one that passes', async () => {
    resetHealthWatch();
    const one = await makeUser('owner', { email: 'one@example.com' });
    const two = await makeUser('owner', { email: 'two@example.com' });
    await makeUser('owner', { email: 'gone@example.com', active: false });
    await makeUser('member', { email: 'member@example.com' });

    // First run after a start: nothing, whatever it sees.
    assert.deepEqual(await watchHealth([problem('backup_stale')]), []);
    assert.equal((await sentSubjects()).length, 0);
    // Seen twice: told, one message per owner.
    assert.deepEqual(await watchHealth([problem('backup_stale'), problem('disk_low')]), [
      'backup_stale',
    ]);
    const told = await sentSubjects();
    assert.equal(told.length, 2);
    assert.deepEqual(new Set(told.map((row) => row.userId)), new Set([one.id, two.id]));
    assert.match(told[0]?.text ?? '', /Something about backup_stale/);
    // Still there: not told again. disk_low passed between runs: never told.
    assert.deepEqual(await watchHealth([problem('backup_stale')]), []);
    assert.equal((await sentSubjects()).length, 2);
    // Gone, then back for two runs: told again.
    assert.deepEqual(await watchHealth([]), []);
    assert.deepEqual(await watchHealth([problem('backup_stale')]), []);
    assert.deepEqual(await watchHealth([problem('backup_stale')]), ['backup_stale']);
    assert.equal((await sentSubjects()).length, 4);
  });

  it('is on the clock every quarter of an hour', async () => {
    await import('../jobs/health-watch.ts');
    const { registeredSchedules } = await import('../jobs/schedules.ts');
    const watch = registeredSchedules().find((s) => s.name === HEALTH_WATCH);
    assert.deepEqual(watch?.spec, { everyMinutes: 15 });
  });
});
