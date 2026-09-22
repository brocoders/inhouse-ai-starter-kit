// Tests get a real PostgreSQL each, and the expensive part is not our schema —
// it is PostgreSQL creating its data directory from scratch. Measured here:
// 1,592 ms to initialise an empty database against 35 ms to run every
// migration, and 223 ms to restore a finished one from a file.
//
// So the first test process that migrates a database writes a copy of the
// finished data directory to a cache, and every later process starts from that
// copy instead. `node --test` runs each test file in its own process, so this
// is the difference between a suite that waits on PostgreSQL and one that does
// not.
//
// The cache key is the migrations themselves: change one and the key changes,
// so a stale snapshot is never trusted. It lives under `node_modules/.cache`,
// which a fresh install clears and Git never sees.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { migrationsFolder } from './migrate.ts';

const cacheDir = path.resolve('node_modules/.cache/inhouse-pglite');

let key: string | undefined;

function cacheKey(): string {
  if (key) return key;
  const hash = createHash('sha256');
  for (const name of readdirSync(migrationsFolder).sort()) {
    if (!name.endsWith('.sql')) continue;
    hash.update(name);
    hash.update(readFileSync(path.join(migrationsFolder, name)));
  }
  key = hash.digest('hex').slice(0, 16);
  return key;
}

/** The finished data directory to start from, or nothing if there is no usable copy. */
export function cachedDataDir(): File | undefined {
  try {
    const bytes = readFileSync(path.join(cacheDir, `${cacheKey()}.tar`));
    return new File([bytes], 'pgdata.tar', { type: 'application/x-tar' });
  } catch {
    return undefined;
  }
}

/** Keep this migrated database for the next test process. Failing is only a lost second. */
export async function cacheDataDir(client: PGlite): Promise<void> {
  try {
    const dump = await client.dumpDataDir('none');
    mkdirSync(cacheDir, { recursive: true });
    // Two test processes can race to fill an empty cache. Each writes a whole
    // file under a private name and renames it into place, which is atomic:
    // a reader sees one complete snapshot or none at all.
    const temporary = path.join(cacheDir, `${cacheKey()}.${process.pid}.tmp`);
    writeFileSync(temporary, Buffer.from(await dump.arrayBuffer()));
    renameSync(temporary, path.join(cacheDir, `${cacheKey()}.tar`));
    for (const name of readdirSync(cacheDir)) {
      if (!name.startsWith(cacheKey())) rmSync(path.join(cacheDir, name), { force: true });
    }
  } catch {
    // A cache we cannot write is a slower suite, not a broken one.
  }
}
