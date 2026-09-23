// The seed script can make anybody an owner, so the two things it must never
// do quietly are: run against production by accident, and change somebody's
// role without leaving a line in the history.
//
// It is run here as the real command, in a folder of its own, because what is
// being tested is the script as somebody would type it — its flags, its exit
// code and what it leaves in the database.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { after, describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const run = promisify(execFile);
const script = path.resolve(import.meta.dirname, '../../../scripts/seed.ts');
const folders: string[] = [];
after(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});

function environment(dataDir: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  // Without the test runner's marker the settings read DATA_DIR as given,
  // which is the point: the script must see the folder this test made.
  const {
    NODE_TEST_CONTEXT: _context,
    DATABASE_URL: _database,
    RESEND_API_KEY: _resend,
    DEV_AUTO_SIGN_IN_EMAIL: _dev,
    ...rest
  } = process.env;
  return { ...rest, NODE_ENV: 'development', DATA_DIR: dataDir, ...extra };
}

function folder(): string {
  const made = mkdtempSync(path.join(tmpdir(), 'inhouse-seed-'));
  folders.push(made);
  return made;
}

async function seed(dataDir: string, args: string[], extra?: Record<string, string>) {
  return run(process.execPath, [script, ...args], { env: environment(dataDir, extra) });
}

describe('the seed script', () => {
  it('refuses to touch a production database unless told in so many words', async () => {
    const dataDir = folder();
    const production = { NODE_ENV: 'production', BETTER_AUTH_SECRET: 'x'.repeat(32) };
    await assert.rejects(seed(dataDir, ['--owner', 'o@example.com', 'O'], production), (error) => {
      const failed = error as { code: number; stderr: string };
      assert.equal(failed.code, 1);
      assert.match(failed.stderr, /--i-mean-production/);
      return true;
    });
    assert.equal(existsSync(path.join(dataDir, 'db', 'PG_VERSION')), false, 'it built a database');
  });

  it('writes down promoting somebody who was already on the list', async () => {
    const dataDir = folder();
    await seed(dataDir, ['--owner', 'o@example.com', 'O']);

    // Somebody demoted and turned off the owner since.
    const first = new PGlite(path.join(dataDir, 'db'));
    await first.query(`update "user" set role = 'viewer', active = false`);
    await first.query('delete from audit_log');
    await first.close();

    const { stdout } = await seed(dataDir, ['--owner', 'o@example.com', 'O']);
    assert.match(stdout, /owner again/);

    const second = new PGlite(path.join(dataDir, 'db'));
    const people = await second.query<{ role: string; active: boolean }>(
      'select role, active from "user"',
    );
    const lines = await second.query<{ actor_id: string | null; action: string; changes: unknown }>(
      'select actor_id, action, changes from audit_log',
    );
    await second.close();
    assert.deepEqual(people.rows, [{ role: 'owner', active: true }]);
    assert.equal(lines.rows.length, 1);
    assert.equal(lines.rows[0]?.actor_id, null);
    assert.equal(lines.rows[0]?.action, 'updated');
    assert.deepEqual(lines.rows[0]?.changes, {
      role: { from: 'viewer', to: 'owner' },
      active: { from: false, to: true },
    });
  });
});
