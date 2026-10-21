// deploy/backup.sh run whole against a scratch folder, with docker and restic
// replaced by stubs that write down what they were asked. The dump itself is
// whatever the stubbed pg_dump prints; what is proved here is the shape of
// the script: a real file or a plain refusal, and the off-site copy only when
// the owner has set it up, never failing the dump when it fails itself.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

const script = path.resolve(import.meta.dirname, '..', 'deploy', 'backup.sh');

const DOCKER = `#!/bin/bash
printf 'docker %s\\n' "$*" >>"$STUB_LOG"
# compose ... exec -T db pg_dump ... : a dump big enough to pass the size check.
case "$*" in *pg_dump*) head -c 4096 /dev/zero | tr '\\0' 'x' ;; esac
exit 0
`;
const RESTIC = `#!/bin/bash
printf 'restic %s\\n' "$*" >>"$STUB_LOG"
# Never print the environment: the test checks that the keys stay out of the log.
case "$1" in
  cat) [ "\${STUB_REPO_EXISTS:-1}" = 1 ] && exit 0 || exit 1 ;;
  backup) [ "\${STUB_RESTIC_FAILS:-}" = 1 ] && { echo "Fatal: unable to open repository" >&2; exit 1; } ;;
esac
exit 0
`;

function setup({ offsite = false, restic = true } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'backup-'));
  const bin = path.join(root, 'bin');
  const dir = path.join(root, 'app');
  const out = path.join(root, 'dumps');
  mkdirSync(bin);
  mkdirSync(path.join(dir, 'current'), { recursive: true });
  writeFileSync(path.join(dir, 'current', 'compose.yaml'), 'services: {}\n');
  writeFileSync(path.join(dir, '.env'), 'APP_SLUG=orders\n');
  writeFileSync(path.join(bin, 'docker'), DOCKER, { mode: 0o755 });
  if (restic) writeFileSync(path.join(bin, 'restic'), RESTIC, { mode: 0o755 });
  if (offsite) {
    writeFileSync(
      path.join(dir, '.backup.env'),
      [
        'RESTIC_REPOSITORY=s3:https://example.invalid/bucket',
        'RESTIC_PASSWORD=test-password-not-real',
        'AWS_ACCESS_KEY_ID=test-key-id',
        'AWS_SECRET_ACCESS_KEY=test-secret',
        '',
      ].join('\n'),
      { mode: 0o600 },
    );
  }
  const log = path.join(root, 'calls.log');
  writeFileSync(log, '');
  return { root, bin, dir, out, log };
}

function run(env, ...args) {
  const result = spawnSync('bash', [script, 'orders', ...args], {
    encoding: 'utf8',
    env: {
      PATH: `${env.bin}:${process.env.PATH}`,
      APP_DIR: env.dir,
      BACKUP_DIR: env.out,
      STUB_LOG: env.log,
      ...env.extra,
    },
  });
  const lines = result.stdout.trim().split('\n').filter(Boolean);
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    last: lines.length ? JSON.parse(lines.at(-1)) : null,
    calls: readFileSync(env.log, 'utf8').trim().split('\n').filter(Boolean),
  };
}

describe('backup.sh', () => {
  it('writes one dump named for the second, and says so in one JSON line', () => {
    const env = setup();
    const r = run(env);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.last.event, 'backup_completed');
    assert.equal(r.last.off_server, false);
    assert.match(path.basename(r.last.file), /^app-\d{4}-\d{2}-\d{2}T\d{6}Z\.dump$/);
    assert.equal(r.last.bytes, 4096);
    assert.deepEqual(
      readdirSync(env.out).filter((name) => !name.startsWith('.')),
      [path.basename(r.last.file)],
    );
    assert.ok(!r.calls.some((c) => c.startsWith('restic')), 'no off-site without .backup.env');
  });

  it('says it skipped when nothing is deployed yet', () => {
    const env = setup();
    const r = run({ ...env, dir: path.join(env.root, 'empty') });
    assert.notEqual(r.status, 0);
  });

  it('sends the dump and the settings file off-site once .backup.env exists', () => {
    const env = setup({ offsite: true });
    const r = run(env);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.last.off_server, true);
    const restic = r.calls.filter((c) => c.startsWith('restic'));
    assert.match(restic.join('\n'), /^restic cat config$/m);
    assert.match(
      restic.join('\n'),
      new RegExp(`^restic backup -q --tag orders ${r.last.file} ${env.dir}/.env$`, 'm'),
    );
    assert.match(
      restic.join('\n'),
      /^restic forget -q --tag orders --keep-daily 14 --keep-weekly 8 --keep-monthly 6 --prune$/m,
    );
    const marker = readFileSync(path.join(env.out, '.offsite-last'), 'utf8').trim();
    assert.match(marker, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    // The keys travel in the environment and never through the log or output.
    for (const text of [r.stdout, r.stderr, r.calls.join('\n')]) {
      assert.ok(!text.includes('test-secret'), 'a secret reached the output');
      assert.ok(!text.includes('test-password-not-real'), 'the password reached the output');
    }
  });

  it('makes the repository on first use', () => {
    const env = setup({ offsite: true });
    const r = run({ ...env, extra: { STUB_REPO_EXISTS: '0' } });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.calls.join('\n'), /^restic init -q$/m);
  });

  it('keeps the dump and reports when the off-site copy fails, without failing the backup', () => {
    const env = setup({ offsite: true });
    const r = run({ ...env, extra: { STUB_RESTIC_FAILS: '1' } });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.last.event, 'backup_completed');
    assert.equal(r.last.off_server, false);
    assert.match(r.stderr, /backup_offsite_failed/);
    assert.equal(
      existsSync(path.join(env.out, '.offsite-last')),
      false,
      'no marker for a copy that did not happen',
    );
  });

  it('says plainly when restic is not installed', () => {
    const env = setup({ offsite: true, restic: false });
    const r = run(env);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.last.off_server, false);
    assert.match(r.stderr, /restic is not installed/);
  });
});
