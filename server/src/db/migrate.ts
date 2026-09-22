// Migrations run at startup, before the server accepts a request. Drizzle
// records which files it has applied in `drizzle.__drizzle_migrations`, so
// running them twice does nothing the second time.
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { sql } from 'drizzle-orm';
import path from 'node:path';
import { config } from '../config.ts';
import { query, type Db, type DbHandle } from './index.ts';

// The migrations are SQL files, not TypeScript, so `tsc` does not carry them
// into `dist/` and they cannot be found next to the compiled code. They are
// found from the application's own folder instead, which is where the server
// is started from in development and in the container alike — the same
// assumption the built screens under `dist/frontend` already make.
export const migrationsFolder = path.resolve('server/drizzle');

export async function migrateDb(target: DbHandle): Promise<void> {
  // PGlite has one connection and takes its time zone from the host, so it is
  // told once, here, before anything asks it what time it is.
  if (target.client) await target.db.execute(sql`set time zone 'UTC'`);
  const run = target.kind === 'postgres' ? migratePg : migratePglite;
  // Each migrator insists on its own driver's database type; the query builder
  // underneath is the same one, so the cast is safe and saves a second wrapper.
  await run(target.db as never, { migrationsFolder });
  // A test database that did the work keeps a copy for the next test process.
  if (config.isTest && target.client && !target.restored) {
    const { cacheDataDir } = await import('./snapshot.ts');
    await cacheDataDir(target.client);
  }
}

/** How many migrations this database has applied — the ops page's schema version. */
export async function schemaVersion(db: Db): Promise<number> {
  const rows = await query<{ count: number }>(
    sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
    db,
  );
  return Number(rows[0]?.count ?? 0);
}
