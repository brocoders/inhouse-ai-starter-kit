// The applied-migration rule in check-repo.mjs, against a throwaway Git
// repository: an edited or deleted migration from `main` is reported, a new
// one is not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { baseRef, changedMigrations } from './check-repo.mjs';

function repository() {
  const root = mkdtempSync(path.join(tmpdir(), 'check-repo-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git('init', '--quiet', '--initial-branch=main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  mkdirSync(path.join(root, 'server/drizzle/meta'), { recursive: true });
  writeFileSync(path.join(root, 'server/drizzle/0000_first.sql'), 'CREATE TABLE a (id int);\n');
  writeFileSync(path.join(root, 'server/drizzle/0001_second.sql'), 'CREATE TABLE b (id int);\n');
  writeFileSync(path.join(root, 'server/drizzle/meta/_journal.json'), '{}\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'first');
  git('switch', '--quiet', '-c', 'work');
  return { root, git };
}

test('an untouched tree has no changed migrations', () => {
  const { root } = repository();
  try {
    assert.equal(baseRef(root), 'main');
    assert.deepEqual(changedMigrations(root, 'main'), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an edited or deleted migration from main is reported; a new one is not', () => {
  const { root, git } = repository();
  try {
    writeFileSync(
      path.join(root, 'server/drizzle/0000_first.sql'),
      'CREATE TABLE a (id bigint);\n',
    );
    rmSync(path.join(root, 'server/drizzle/0001_second.sql'));
    writeFileSync(path.join(root, 'server/drizzle/0002_third.sql'), 'CREATE TABLE c (id int);\n');
    writeFileSync(path.join(root, 'server/drizzle/meta/_journal.json'), '{"x":1}\n');
    assert.deepEqual(changedMigrations(root, 'main'), [
      'server/drizzle/0000_first.sql',
      'server/drizzle/0001_second.sql',
    ]);
    // Committing the edit on the branch does not hide it.
    git('add', '.');
    git('commit', '--quiet', '-m', 'edit');
    assert.deepEqual(changedMigrations(root, 'main'), [
      'server/drizzle/0000_first.sql',
      'server/drizzle/0001_second.sql',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a clone without main says so instead of guessing', () => {
  const { root, git } = repository();
  try {
    git('branch', '--quiet', '-m', 'main', 'trunk');
    assert.equal(baseRef(root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
