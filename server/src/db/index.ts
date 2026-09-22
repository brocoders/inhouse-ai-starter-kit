// One database, reached two ways. In production `DATABASE_URL` points at the
// PostgreSQL container and we use a connection pool. With no `DATABASE_URL`
// the app runs PGlite — real PostgreSQL compiled into the process, storing its
// files under `DATA_DIR/db` — so a new clone starts with nothing installed.
// Tests get the same engine in memory.
//
// Both roads end at the same Drizzle query builder, so no query in this
// codebase knows which one it is talking to.
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import type { SQL } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import path from 'node:path';
import pg from 'pg';
import { config } from '../config.ts';
import { schema } from './schema.ts';
import { cachedDataDir } from './snapshot.ts';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export type DbHandle = {
  db: Db;
  kind: 'postgres' | 'pglite';
  /** The PGlite engine, when that is what we are running — the tests cache it. */
  client: PGlite | undefined;
  /** True when this database started from a cached snapshot rather than empty. */
  restored: boolean;
  close: () => Promise<void>;
};

export function createDb(): DbHandle {
  if (config.databaseUrl) {
    const pool = new pg.Pool({
      connectionString: config.databaseUrl,
      max: 10,
      connectionTimeoutMillis: 5_000,
    });
    // A pool that loses a connection emits an error nobody is listening for,
    // which would take the whole process down. Losing one connection is not fatal.
    pool.on('error', () => {});
    // Every connection speaks UTC, so `now()` and any date the database works
    // out for itself mean the same thing as a date this app wrote.
    pool.on('connect', (client) => {
      void client.query("set time zone 'UTC'");
    });
    return {
      db: drizzlePg({ client: pool, schema }) as unknown as Db,
      kind: 'postgres',
      client: undefined,
      restored: false,
      close: () => pool.end(),
    };
  }
  const inMemory = config.isTest;
  const snapshot = inMemory ? cachedDataDir() : undefined;
  const client = inMemory
    ? new PGlite('memory://', snapshot ? { loadDataDir: snapshot } : {})
    : new PGlite(path.join(config.dataDir, 'db'));
  return {
    db: drizzlePglite({ client, schema }) as unknown as Db,
    kind: 'pglite',
    client,
    restored: snapshot !== undefined,
    close: () => client.close(),
  };
}

export const handle: DbHandle = createDb();
export const db: Db = handle.db;

/**
 * Run SQL that the query builder cannot express and read the rows back.
 *
 * A raw result is shaped by the driver rather than by the schema, so the two
 * engines disagree about detail — most sharply about dates, where the
 * PostgreSQL driver hands back a string and PGlite a `Date`. Anything raw
 * therefore asks the database for the shape it wants (a count as an integer,
 * a timestamp already formatted as text) instead of converting afterwards.
 */
export async function query<T extends Record<string, unknown>>(
  statement: SQL,
  database: Db = db,
): Promise<T[]> {
  const result = (await database.execute(statement)) as unknown as { rows: T[] };
  return result.rows;
}
