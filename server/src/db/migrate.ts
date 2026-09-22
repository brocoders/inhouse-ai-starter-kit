// Migrations run at startup, before the server accepts a request. Drizzle
// records which files it has applied in `drizzle.__drizzle_migrations`, so
// running them twice does nothing the second time.
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { sql } from 'drizzle-orm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.ts';
import type { Db, DbHandle } from './index.ts';

// Resolved from this file so it works the same run from source and run from
// `dist/`, where the layout below `server/` is identical.
export const migrationsFolder = path.resolve(fileURLToPath(import.meta.url), '../../../drizzle');

export async function migrateDb(target: DbHandle): Promise<void> {
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
  const result = await db.execute<{ count: string | number }>(
    sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
  );
  return Number(result.rows[0]?.count ?? 0);
}
