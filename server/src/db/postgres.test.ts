// PGlite passing is not proof that PostgreSQL will.
//
// The two are close but not the same: PGlite is one connection, so it can
// never show two workers competing for the same job, and it embeds a
// different major version. So one run goes against the real thing — the
// migrations from an empty database, then the list that every screen depends
// on, then the piece PGlite structurally cannot test: two workers reaching for
// one job at the same instant.
//
// It runs when CI provides the service, or when somebody sets it up locally:
//
//   TEST_POSTGRES=1 TEST_DATABASE_URL=postgres://... pnpm test:postgres
//
// Without those it skips, and says so, rather than passing quietly.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

const live = process.env.TEST_POSTGRES === '1' && Boolean(process.env.TEST_DATABASE_URL);

describe(
  'against a real PostgreSQL',
  { skip: live ? false : 'set TEST_POSTGRES=1 and TEST_DATABASE_URL' },
  () => {
    it('migrates from nothing, pages a list, and hands one job to one worker', async () => {
      // Imported here rather than at the top so that a skipped run does not try
      // to open a connection that is not there.
      const { handle, db } = await import('./index.ts');
      const { migrateDb, schemaVersion } = await import('./migrate.ts');
      const { items, jobs } = await import('./schema.ts');
      const { listItems } = await import('../routes/items.ts');
      const { claim, enqueue } = await import('../jobs/queue.ts');
      const { sql } = await import('drizzle-orm');

      assert.equal(handle.kind, 'postgres', 'this test must be talking to PostgreSQL');

      // From nothing: drop everything this app owns and build it again.
      await db.execute(sql`drop schema if exists public cascade`);
      await db.execute(sql`create schema public`);
      await db.execute(sql`drop schema if exists drizzle cascade`);
      await migrateDb(handle);
      assert.ok((await schemaVersion(db)) >= 1);

      // The list, walked the same way a screen walks it.
      const base = Date.parse('2026-05-01T09:00:00Z');
      const seeded = Array.from({ length: 25 }, (_, i) => {
        const createdAt = new Date(base + Math.floor(i / 2) * 3_600_000);
        return {
          id: randomUUID(),
          title: `Task ${i}`,
          status: (i % 3 === 0 ? 'done' : 'open') as 'done' | 'open',
          createdAt,
          updatedAt: createdAt,
        };
      });
      await db.insert(items).values(seeded);

      const expected = [...seeded]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id))
        .map((row) => row.id);

      for (const status of [undefined, 'open' as const, 'done' as const]) {
        const wanted = expected.filter(
          (id) => !status || seeded.find((row) => row.id === id)?.status === status,
        );
        const walked: string[] = [];
        let cursor: string | undefined;
        for (let guard = 0; guard < 40; guard++) {
          const page = await listItems(db, {
            limit: 4,
            ...(cursor ? { cursor } : {}),
            ...(status ? { status } : {}),
          });
          assert.equal(page.total, wanted.length);
          walked.push(...page.rows.map((row) => row.id));
          if (!page.nextCursor) break;
          cursor = page.nextCursor;
        }
        assert.deepEqual(walked, wanted, `paging went wrong for status=${status ?? 'any'}`);
      }

      // The one thing PGlite cannot show: two workers, one job, no collision.
      await db.delete(jobs);
      const id = await enqueue('example');
      const grabs = await Promise.all(
        Array.from({ length: 8 }, (_, i) => claim(`worker-${i}`, 60_000)),
      );
      const taken = grabs.filter((row) => row !== undefined);
      assert.equal(taken.length, 1, 'more than one worker took the same job');
      assert.equal(taken[0]?.id, id);

      await handle.close();
    });
  },
);
