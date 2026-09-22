#!/usr/bin/env node
// Work on a copy, never on production.
//
//   pnpm db:copy               pull the live database into the local dev one
//   pnpm db:copy --anonymize   … and replace people's names and e-mails first
//   pnpm db:copy --dry-run     show exactly what would run, touch nothing
//   pnpm db:copy --help
//
// What it does: asks the server for a dump over SSH, writes it to
// data/dev/copy.sql, throws away the local dev database and rebuilds it from
// that file. Nothing is ever sent to the server — the only command that runs
// there is a read-only pg_dump.
//
// Use --anonymize before taking screenshots or sharing anything: real names in
// a PNG are the easiest leak there is.
import { spawnSync } from 'node:child_process';
import {
  openSync,
  closeSync,
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { readConfigOrExit, ROOT } from './lib/config.mjs';
import { statements } from './lib/sql-statements.mjs';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);

if (has('--help') || has('-h')) {
  console.log(`Work on a copy, never on production.

  pnpm db:copy               pull the live database into the local dev one
  pnpm db:copy --anonymize   … and replace every name and e-mail first
  pnpm db:copy --dry-run     show exactly what would run, touch nothing
  pnpm db:copy --help        this

It asks the server named in inhouse.config.json for a dump over SSH, writes it
to data/dev/copy.sql, then throws away the local dev database and rebuilds it
from that file. The only command that runs on the server is a read-only
pg_dump: nothing is ever written there.

Use --anonymize before screenshots or before showing anyone — real names in a
PNG are the easiest leak there is.`);
  process.exit(0);
}

const anonymize = has('--anonymize');
const dryRun = has('--dry-run');
const unknown = args.filter((a) => !['--anonymize', '--dry-run', '--help', '-h'].includes(a));
if (unknown.length) {
  console.error(`db-copy: I do not know the option ${unknown[0]}. Run \`pnpm db:copy --help\`.`);
  process.exit(2);
}

const config = readConfigOrExit();
const DEV = path.join(ROOT, 'data', 'dev');
const DUMP = path.join(DEV, 'copy.sql');
const PGLITE_DIR = path.join(DEV, 'db');

// --inserts rather than the default COPY blocks: the copy is replayed
// statement by statement into an embedded Postgres that has no stdin to feed a
// COPY from, and the file stays readable if you ever need to look inside it.
const REMOTE = [
  'docker compose',
  `-f ${config.deploy.dir}/compose.yaml`,
  'exec -T db',
  'pg_dump -U app -d app --format=plain --no-owner --no-privileges --inserts --rows-per-insert=500',
].join(' ');

if (dryRun) {
  console.log('db-copy would run, and nothing else:\n');
  console.log(`  ssh ${config.deploy.host} '${REMOTE}'  >  ${path.relative(ROOT, DUMP)}`);
  console.log(
    `\nThen it would delete ${path.relative(ROOT, PGLITE_DIR)}/ and rebuild it from that file`,
  );
  console.log(
    process.env.DATABASE_URL
      ? '  (DATABASE_URL is set, so it would load with psql into that database instead)'
      : '  (with the embedded database; set DATABASE_URL to load into a real PostgreSQL instead)',
  );
  if (anonymize) console.log('Then it would rewrite every name and e-mail in the user table.');
  process.exit(0);
}

// ── 1. Ask the server for a dump ────────────────────────────────────────────
mkdirSync(DEV, { recursive: true });
console.log(`Asking ${config.deploy.host} for a copy of the database…`);
const dumpFd = openSync(DUMP, 'w');
let ssh;
try {
  // Straight to the file: a dump is far too big to hold in memory for no reason.
  ssh = spawnSync('ssh', [config.deploy.host, REMOTE], { stdio: ['ignore', dumpFd, 'inherit'] });
} finally {
  closeSync(dumpFd);
}
if (ssh.error && ssh.error.code === 'ENOENT') {
  console.error('There is no `ssh` on this computer. On Windows, work inside WSL2.');
  process.exit(1);
}
if (ssh.status !== 0) {
  console.error(
    `\nThe server did not give us a copy (ssh exited ${ssh.status}). The lines above say why. The usual causes:\n` +
      `  · "${config.deploy.host}" is not in your ~/.ssh/config, or the key is not loaded\n` +
      `  · the app is not running there, or compose.yaml is not in ${config.deploy.dir}\n` +
      '  · the database container is not called "db" in compose.yaml\n' +
      'Nothing on the server was changed.',
  );
  process.exit(1);
}
const size = statSync(DUMP).size;
if (size < 100) {
  console.error(
    `The copy is empty (${size} bytes). Check that the app's database on the server has data in it.`,
  );
  process.exit(1);
}
console.log(`Got ${(size / 1024 / 1024).toFixed(1)} MB into ${path.relative(ROOT, DUMP)}.`);

// ── 2. Load it locally ──────────────────────────────────────────────────────
const ANONYMIZE_SQL = `
UPDATE "user" AS u
SET name = 'Person ' || n.rn,
    email = 'person' || n.rn || '@example.invalid'
FROM (SELECT id, row_number() OVER (ORDER BY id) AS rn FROM "user") AS n
WHERE u.id = n.id`;

async function loadWithPsql(url) {
  console.log('DATABASE_URL is set, so the copy goes into that database with psql.');
  const load = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-q', '-f', DUMP], {
    stdio: 'inherit',
  });
  if (load.error && load.error.code === 'ENOENT') {
    console.error(
      'There is no `psql` on this computer. Either install the PostgreSQL client or unset DATABASE_URL.',
    );
    process.exit(1);
  }
  if (load.status !== 0) {
    console.error(
      'psql refused part of the copy; the lines above say which. The local database may be half-loaded.',
    );
    process.exit(1);
  }
  if (anonymize) {
    const redact = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-q', '-c', ANONYMIZE_SQL], {
      stdio: 'inherit',
    });
    if (redact.status !== 0) {
      console.error(
        'The copy loaded, but the names could not be replaced. Do not take screenshots of it.',
      );
      process.exit(1);
    }
  }
  return null;
}

async function loadWithPglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  // A fresh directory, not a reset: leftovers from the previous copy in tables
  // this dump no longer has would quietly survive and confuse everyone.
  rmSync(PGLITE_DIR, { recursive: true, force: true });
  mkdirSync(PGLITE_DIR, { recursive: true });
  const db = new PGlite(PGLITE_DIR);
  const all = statements(readFileSync(DUMP, 'utf8'));
  let done = 0;
  try {
    for (const statement of all) {
      try {
        await db.exec(statement);
        done += 1;
      } catch (error) {
        console.error(
          `\nThe copy stopped at statement ${done + 1} of ${all.length}:\n` +
            `  ${statement.split('\n')[0].slice(0, 120)}\n` +
            `  ${error.message}\n` +
            'The local database is half-loaded; the server was not touched.',
        );
        process.exit(1);
      }
    }
    if (anonymize) {
      try {
        await db.exec(ANONYMIZE_SQL);
      } catch (error) {
        console.error(`The copy loaded, but the names could not be replaced (${error.message}).`);
        console.error('Do not take screenshots of it.');
        process.exit(1);
      }
    }
  } finally {
    await db.close();
  }
  return done;
}

const loaded = process.env.DATABASE_URL
  ? await loadWithPsql(process.env.DATABASE_URL)
  : await loadWithPglite();

console.log('');
console.log(
  `The local database is now a copy of the server's${loaded === null ? '' : `, ${loaded} statements replayed`}.`,
);
if (anonymize)
  console.log('Every name and e-mail in it was replaced, so screenshots are safe to share.');
else
  console.log(
    'It holds real names and e-mails. Add --anonymize next time if you are going to show anyone.',
  );
console.log('Nothing was written to the server.');
console.log('');
console.log('Next: `pnpm dev`, then open the app and reproduce what you are investigating.');
if (existsSync(DUMP))
  console.log(`The dump itself stays at ${path.relative(ROOT, DUMP)} until the next copy.`);
