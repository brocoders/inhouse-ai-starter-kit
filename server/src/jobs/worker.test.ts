// The promise this file exists to keep: one failing job never stops the
// worker. Everything else here — the lease, the retries, the growing wait —
// is in service of that.
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { jobs } from '../db/schema.ts';
import { closeDb, ready, reset } from '../test/helpers.ts';
import { claim, enqueue, releaseExpired } from './queue.ts';
import { backoffFor, defineJob, tick } from './worker.ts';

before(ready);
after(closeDb);
beforeEach(reset);

const readJob = async (id: string) =>
  (await db.select().from(jobs).where(eq(jobs.id, id)).limit(1))[0];

describe('taking a job', () => {
  it('takes it once and leaves nothing for a second worker', async () => {
    await enqueue('example', { n: 1 });
    const first = await claim('worker-a', 60_000);
    const second = await claim('worker-b', 60_000);
    assert.equal(first?.name, 'example');
    assert.equal(first?.status, 'running');
    assert.equal(first?.attempts, 1);
    assert.equal(second, undefined, 'the same job was handed out twice');
  });

  it('leaves a job alone until it is due', async () => {
    await enqueue('example', {}, { runAt: new Date(Date.now() + 60_000) });
    assert.equal(await claim('worker-a', 60_000), undefined);
  });

  it('gives a job back when the worker holding it went away', async () => {
    const id = await enqueue('example');
    const taken = await claim('worker-a', 60_000);
    assert.equal(taken?.id, id);

    // The worker died: its lease runs out with the job still marked running.
    await db
      .update(jobs)
      .set({ lockedUntil: new Date(Date.now() - 1_000) })
      .where(eq(jobs.id, id));
    assert.equal(await releaseExpired(), 1);
    assert.equal((await readJob(id))?.status, 'queued');
    assert.equal((await claim('worker-b', 60_000))?.id, id, 'nobody could pick it up again');
  });
});

describe('a job that fails', () => {
  it('waits longer before each retry, then gives up and says why', async () => {
    let tries = 0;
    defineJob('always-fails', () => {
      tries += 1;
      throw new Error('the supplier said no');
    });
    const id = await enqueue('always-fails', {}, { maxAttempts: 3 });

    for (let attempt = 1; attempt <= 3; attempt++) {
      // Make it due again, so a test does not have to wait out the backoff.
      await db
        .update(jobs)
        .set({ runAt: new Date(Date.now() - 1_000) })
        .where(eq(jobs.id, id));
      assert.equal(await tick({ backoffMs: 1_000 }), true);
      const row = await readJob(id);
      assert.equal(row?.attempts, attempt);
      assert.equal(row?.lastError, 'the supplier said no');
      assert.equal(row?.status, attempt < 3 ? 'queued' : 'failed');
    }
    assert.equal(tries, 3);
    const failed = await readJob(id);
    assert.ok(failed?.finishedAt, 'a job that gave up should say when');
    assert.equal(failed?.lockedBy, null, 'a finished job holds no lease');
  });

  it('waits twice as long each time, up to an hour', () => {
    assert.equal(backoffFor(1, 30_000), 30_000);
    assert.equal(backoffFor(2, 30_000), 60_000);
    assert.equal(backoffFor(3, 30_000), 120_000);
    assert.equal(backoffFor(20, 30_000), 60 * 60_000);
  });

  it('does not stop the next job from running', async () => {
    const done: string[] = [];
    defineJob('explodes', () => {
      throw new Error('boom');
    });
    defineJob('works', (payload) => {
      done.push(String(payload.label));
    });

    await enqueue('explodes', {}, { maxAttempts: 1 });
    await enqueue('works', { label: 'first' });
    await enqueue('works', { label: 'second' });

    assert.equal(await tick({ backoffMs: 10 }), true); // the failing one
    assert.equal(await tick({ backoffMs: 10 }), true);
    assert.equal(await tick({ backoffMs: 10 }), true);
    assert.deepEqual(done, ['first', 'second']);
  });

  it('writes down a job nobody knows how to run, rather than throwing', async () => {
    const id = await enqueue('nobody-defined-this', {}, { maxAttempts: 1 });
    assert.equal(await tick({ backoffMs: 10 }), true);
    const row = await readJob(id);
    assert.equal(row?.status, 'failed');
    assert.match(row?.lastError ?? '', /no handler/);
  });
});

describe('a job that works', () => {
  it('is marked done and holds no lease afterwards', async () => {
    defineJob('tidy', () => {});
    const id = await enqueue('tidy');
    await tick();
    const row = await readJob(id);
    assert.equal(row?.status, 'done');
    assert.equal(row?.lastError, null);
    assert.equal(row?.lockedUntil, null);
    assert.ok(row?.finishedAt);
  });

  it('reports having nothing to do when the queue is empty', async () => {
    assert.equal(await tick(), false);
  });
});
