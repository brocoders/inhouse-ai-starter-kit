// Every message is written down whether or not it went out, because "did they
// ever get told?" is a question somebody asks weeks later.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, describe, it } from 'node:test';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { notifications } from '../db/schema.ts';
import { closeDb, makeUser, ready, reset } from '../test/helpers.ts';
import { notify } from './index.ts';
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
    assert.equal(sent.status, 'failed');
    const row = await readRow(sent.id);
    assert.equal(row?.status, 'failed');
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
