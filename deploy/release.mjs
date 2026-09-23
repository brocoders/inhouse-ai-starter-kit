#!/usr/bin/env node
// One command puts a commit on the server:
//
//   pnpm release <the 40-character commit id>
//   pnpm release <sha> --dry-run          shows the plan, changes nothing
//   pnpm release <sha> --allow-rollback   go back to an older commit on purpose
//
// It runs on the creator's own machine and drives the server over SSH. No
// dependencies: Node and the ssh, scp and git already on the machine.
//
// Every step below is a gate. Until the switch — step 9 of 11 — a failure
// leaves the previous release serving and the database untouched; the script
// stops, says which gate refused and why, and cleans up after itself whatever
// happened, Ctrl-C included. The gates exist because each of them was once the
// thing that was missing:
//
//   - the lock, because two releases at once share a server, a database and a
//     disk, and each one's temporary files are the other one's surprise
//   - the archive digest, because a truncated transfer looks like a build error
//   - the ancestor guard, because on 14 September 2026 a release deployed over
//     a newer one and silently withdrew somebody's fix for thirteen minutes
//   - the second ancestor check after the build, because on 17 September 2026
//     another session released during the rehearsal and the switch undid it
//   - the backup before anything changes, because "we can always go back" is
//     only true if somebody made it true earlier
//   - the migration rehearsal on a restored copy, because a migration proved
//     against an empty database is not proved (13 September 2026) — and so the
//     copy is checked for holding tables before the migration runs on it
//   - the record written at the moment of the switch, not after the check that
//     follows it, because a failed check used to leave the new release serving
//     while the server still named the old one, and the next release's ancestor
//     guard then judged against the wrong commit
//   - the cleanup on every exit, because until 19 September 2026 it was the
//     last line of a script that only reached its last line on success, and
//     twenty-one abandoned build trees were holding 5.8 GB of a 92% full disk
//   - the prune, for the same reason, from the other end
//
// The very first release has no data to back up and none to rehearse on, so it
// skips those two gates and says so. It still creates the database and runs the
// real migration before the switch.
//
// Tested without a server by putting stub `ssh`, `scp`, `docker` and `flock`
// first on PATH: the ssh stub runs the remote script locally against a fake
// server folder. See the fix(deploy) commit that introduced the lock for the
// scenarios exercised.

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// --- saying what is happening ----------------------------------------------

const started = Date.now();
let currentStep = 'start';

function log(message, fields = {}) {
  const parts = [new Date().toISOString(), `step=${currentStep}`, message];
  for (const [key, value] of Object.entries(fields)) parts.push(`${key}=${value}`);
  console.log(parts.join('  '));
}

function step(name, message) {
  currentStep = name;
  console.log('');
  log(message);
}

class Refusal extends Error {
  constructor(message, hint) {
    super(message);
    this.hint = hint;
  }
}

class Interrupted extends Error {}

// --- arguments and configuration -------------------------------------------

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));
const sha = positional[0] ?? '';
const dryRun = flags.has('--dry-run');
const allowRollback = flags.has('--allow-rollback');

for (const flag of flags) {
  if (!['--dry-run', '--allow-rollback'].includes(flag)) {
    console.error(`unknown option ${flag}`);
    process.exit(64);
  }
}
if (!/^[0-9a-f]{40}$/.test(sha)) {
  console.error('usage: pnpm release <40-character commit id> [--dry-run] [--allow-rollback]');
  console.error('');
  console.error('The commit id is the long one. `git rev-parse HEAD` prints it,');
  console.error('and so does the address bar on the commit page on GitHub.');
  process.exit(64);
}
const short = sha.slice(0, 7);

function git(argv, { allowFailure = false } = {}) {
  const result = spawnSync('git', argv, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (result.error) throw new Refusal(`could not run git: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) {
    throw new Refusal(`git ${argv.join(' ')} failed`, (result.stderr || '').trim());
  }
  return {
    status: result.status,
    out: (result.stdout || '').toString().trim(),
    raw: result.stdout,
  };
}

const repoRoot = git(['rev-parse', '--show-toplevel']).out;

// A value written into a Compose env file. Single quotes are the one form in
// which Compose reads everything literally — no `$` interpolation, no escapes —
// so the only characters that cannot appear are the quote itself and a newline.
function envFileValue(key, value) {
  if (/['\n\r]/.test(value)) {
    throw new Refusal(
      `${key} in inhouse.config.json contains a straight quote (') or a line break`,
      'The release writes it into a settings file that cannot carry either. Use a typographic\n' +
        'apostrophe (’) instead of a straight one.',
    );
  }
  return `'${value}'`;
}

// The file is written by `pnpm setup`, not by this script, and another part of
// the kit owns its shape. Read it defensively: a missing or half-filled config
// is the single most likely reason a first release never starts, and "cannot
// read property host of undefined" tells the creator nothing they can act on.
function readConfig() {
  const path = join(repoRoot, 'inhouse.config.json');
  if (!existsSync(path)) {
    throw new Refusal(
      `${path} does not exist`,
      'It holds the server address this releases to. Run `pnpm setup`, or create it by hand:\n' +
        '  { "deploy": { "host": "myapp-server", "dir": "/opt/myapp", "domain": "myapp.example.com" } }',
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Refusal(`${path} is not valid JSON`, error.message);
  }
  const deploy = parsed?.deploy;
  if (!deploy || typeof deploy !== 'object') {
    throw new Refusal(
      `${path} has no "deploy" section`,
      'Expected { "deploy": { host, dir, domain } }',
    );
  }
  const missing = ['host', 'dir', 'domain'].filter(
    (key) => typeof deploy[key] !== 'string' || deploy[key].trim() === '',
  );
  if (missing.length > 0) {
    throw new Refusal(
      `${path} is missing deploy.${missing.join(', deploy.')}`,
      'host is the SSH alias of the server, dir is /opt/<app> on it, domain is the name people type.',
    );
  }
  if (!/^\/[\w.\-/]+$/.test(deploy.dir) || deploy.dir === '/') {
    throw new Refusal(`deploy.dir "${deploy.dir}" does not look like a path under /`);
  }
  // The facts about the app itself. They live here, in the repository, and the
  // release carries them to the server every time — so the server always says
  // what the repository says, and /setup changing the time zone takes effect on
  // the next release rather than never.
  const facts = {};
  for (const key of ['appName', 'timeZone', 'locale']) {
    if (typeof parsed[key] !== 'string' || parsed[key].trim() === '') {
      throw new Refusal(
        `${path} is missing "${key}"`,
        'appName is the name people see, timeZone an IANA name such as Europe/Kyiv, locale a tag such as en-GB.',
      );
    }
    facts[key] = parsed[key].trim();
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: facts.timeZone });
  } catch {
    throw new Refusal(`"timeZone" is "${facts.timeZone}", which is not an IANA time zone name`);
  }
  try {
    Intl.getCanonicalLocales(facts.locale);
  } catch {
    throw new Refusal(`"locale" is "${facts.locale}", which is not a language tag`);
  }
  return {
    host: deploy.host.trim(),
    dir: deploy.dir.trim().replace(/\/$/, ''),
    domain: deploy.domain.trim(),
    // Checked now so a bad value stops the release before anything is sent.
    appEnv: [
      `APP_NAME=${envFileValue('appName', facts.appName)}`,
      `APP_TIME_ZONE=${envFileValue('timeZone', facts.timeZone)}`,
      `APP_LOCALE=${envFileValue('locale', facts.locale)}`,
    ],
  };
}

// Read here, before anything else, and reported the same way every other
// refusal is reported: a stack trace is a bug report, not an instruction.
let config;
try {
  config = readConfig();
} catch (error) {
  console.error('');
  console.error(`STOPPED: ${error.message}`);
  if (error.hint) {
    console.error('');
    console.error(error.hint);
  }
  console.error('');
  process.exit(65);
}
const { host, dir, domain } = config;
const releaseDir = `${dir}/releases/${sha}`;
const remoteArchive = `/tmp/release-${short}.tar.gz`;
const localArchive = join(tmpdir(), `inhouse-release-${short}.tar.gz`);
// Named after this commit, so that nothing one release leaves behind can be
// mistaken for another's. The lock makes a second release wait its turn; the
// names mean that even without it, two releases could not share a file.
const stagingEnv = `${dir}/.release-${short}.env`;
const releaseEnv = `${dir}/.release.env`;
const lockFile = `${dir}/.release.lock`;
const rehearsalDb = `rehearsal_${short}`;

// What goes into the per-release settings file: which commit this is, where its
// source sits, and the facts about the app from inhouse.config.json. Secrets are
// not here — they live in the server's own .env, which server-setup.sh wrote and
// nothing rewrites. Facts about the app come from the repository; secrets stay
// on the server.
const releaseEnvContents =
  [`APP_RELEASE=${sha}`, `APP_SOURCE=${releaseDir}`, ...config.appEnv].join('\n') + '\n';

// Filled in from the server's .env at the start: the name the server was set up
// with (it names the containers, the database volume and the backup command) and
// the folder the dumps go to.
const server = { slug: '', backups: '' };

// --- running things ---------------------------------------------------------

// Single-quote for the shell. Every value that reaches a remote command goes
// through this, so a path with a space in it is a path with a space in it and
// not two arguments.
const q = (value) => `'${String(value).replaceAll("'", `'\\''`)}'`;

// Ctrl-C, or a SIGTERM from whatever is running this, must not skip the cleanup:
// the rehearsal database is a whole second copy of production, and a release
// abandoned during the build used to leave one on the disk. So the signal only
// sets a flag and stops the command in flight; the ordinary failure path then
// runs, the cleanup with it, and the exit status is 130.
let interrupted = null;
let activeChild = null;
function onSignal(signal) {
  if (interrupted) {
    console.error(`(${signal} again — still tidying up, this takes a few seconds)`);
    return;
  }
  interrupted = signal;
  console.error('');
  console.error(`${signal} received — stopping, then tidying up`);
  if (activeChild) activeChild.kill('SIGTERM');
}
process.on('SIGINT', onSignal);
process.on('SIGTERM', onSignal);

// Runs one local command without blocking, so a signal is handled the moment it
// arrives instead of after the step it interrupted has finished on its own.
function run(command, argv, { input = '' } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, argv, { stdio: ['pipe', 'pipe', 'pipe'] });
    activeChild = child;
    const out = [];
    const err = [];
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => err.push(chunk));
    // A command that exits before reading all of its input makes this write
    // fail with EPIPE. That is not a second error: the exit status below is the
    // one that says what happened.
    child.stdin.on('error', () => {});
    child.on('error', (error) => {
      if (activeChild === child) activeChild = null;
      resolve({ error, status: null, signal: null, stdout: '', stderr: '' });
    });
    child.on('close', (status, signal) => {
      if (activeChild === child) activeChild = null;
      resolve({
        status,
        signal,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      });
    });
    child.stdin.end(input);
  });
}

let lockLost = false;

// Each remote step is one SSH connection running one script under
// `set -euo pipefail`, fed on stdin. One connection per step rather than a
// shell kept open: a dropped connection then fails one step loudly instead of
// leaving half a step done quietly.
//
// The script is wrapped in { ... } </dev/null. bash reads a script from a pipe
// a line at a time, and `docker compose exec` forwards its stdin to the
// container even with -T — so without the wrapper, the first exec in a step
// swallows every line after it, and the step "succeeds" having run one
// command. With it, bash reads the whole block before running any of it, and
// nothing inside can read the rest of the script.
function wrapScript(script, flags = '-euo') {
  return `set ${flags} pipefail\n{\n${script}\n} </dev/null\n`;
}

async function remote(script, { allowFailure = false, quiet = false } = {}) {
  if (interrupted) throw new Interrupted();
  if (lockLost) {
    throw new Refusal(
      'the connection holding the release lock closed',
      'Another release could start now, so this one stops. Run the same command again.',
    );
  }
  const result = await run('ssh', ['-o', 'BatchMode=yes', host, 'bash -s'], {
    input: wrapScript(script),
  });
  if (interrupted) throw new Interrupted();
  if (result.error) throw new Refusal(`could not run ssh: ${result.error.message}`);
  const out = result.stdout;
  const err = result.stderr;
  if (!quiet && err.trim()) console.error(err.trimEnd());
  if (result.status !== 0 && !allowFailure) {
    throw new Refusal(
      `the server refused this step (exit ${result.status ?? result.signal})`,
      (err.trim() || out.trim() || 'no output').split('\n').slice(-12).join('\n'),
    );
  }
  return { status: result.status, out: out.trim(), err: err.trim() };
}

// The compose invocation, spelled once. Two --env-file flags because passing
// any --env-file replaces the .env Compose would read on its own, and the two
// files hold different halves of what compose.yaml needs: .env has the secrets
// and the server's own name, the per-release file has which commit this is,
// where its source sits and the facts about the app.
function composeCmd(envFile) {
  return (
    `docker compose -f ${q(`${releaseDir}/compose.yaml`)} --project-directory ${q(dir)} ` +
    `--env-file ${q(`${dir}/.env`)} --env-file ${q(envFile)}`
  );
}

// --- the lock ---------------------------------------------------------------
//
// One SSH connection, open for the whole release, holding an exclusive flock on
// <dir>/.release.lock. flock belongs to the process, not to a file on disk, so
// it cannot go stale: when this script ends — finishing, failing, Ctrl-C, or the
// laptop lid closing — the connection closes, the remote process exits, and the
// lock goes with it.

let lockChild = null;
let releasingLock = false;

async function takeLock() {
  step('lock', `making sure no other release is running on ${host}`);
  if (interrupted) throw new Interrupted();
  const script = `set -euo pipefail
lock=${q(lockFile)}
exec 9>>"$lock"
if ! flock -n 9; then
  printf 'busy %s\\n' "$(cat "$lock")"
  exit 75
fi
printf '%s %s\\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" ${q(short)} >"$lock"
echo locked
# Held while this connection is open. stdin is the connection: when the release
# ends, however it ends, cat reads end-of-file and the lock is released.
cat >/dev/null
`;
  // detached: a Ctrl-C in the terminal goes to this script and the command in
  // flight, not to the lock — it has to outlive them until the cleanup is done.
  const child = spawn('ssh', ['-o', 'BatchMode=yes', host, `bash -c ${q(script)}`], {
    detached: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  lockChild = child;
  child.stdin.on('error', () => {}); // see run(): the exit status is the report
  const first = await new Promise((resolve) => {
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
      const newline = out.indexOf('\n');
      if (newline !== -1) resolve({ line: out.slice(0, newline) });
    });
    child.stderr.on('data', (chunk) => (err += chunk));
    child.on('error', (error) => resolve({ line: '', err: error.message }));
    child.on('close', (status) => resolve({ line: out.trim(), err: err.trim(), status }));
  });
  if (first.line === 'locked') {
    child.on('close', () => {
      if (!releasingLock) lockLost = true;
    });
    log('no other release is running; holding the lock until this one ends');
    return;
  }
  lockChild = null;
  if (first.line.startsWith('busy')) {
    const [, time, other] = first.line.split(' ');
    throw new Refusal(
      `another release is running (started ${time || 'at an unknown time'}, releasing ${other || 'an unknown commit'})`,
      'Wait for it to finish, then run the same command again. The ancestor guard will then\n' +
        'check this commit against whatever that release put out.',
    );
  }
  throw new Refusal(
    `could not take the release lock on ${host}`,
    first.err || first.line || 'no output — is flock installed? It is part of util-linux.',
  );
}

function releaseLock() {
  if (!lockChild) return;
  releasingLock = true;
  lockChild.stdin.end();
  lockChild.unref();
}

// --- cleanup ----------------------------------------------------------------
//
// Installed before the first remote command creates anything, and it is the one
// exit path for every outcome. Neither half may change the exit status: a
// release that worked is not retroactively a failure because a temporary file
// survived, so each part reports its own trouble and leaves the status alone.

let rehearsing = false;
let transferred = false;

function cleanup() {
  try {
    if (existsSync(localArchive)) unlinkSync(localArchive);
  } catch (error) {
    console.error(`WARNING: could not remove ${localArchive}: ${error.message}`);
  }
  if (!transferred && !rehearsing) {
    releaseLock();
    return;
  }
  // The rehearsal database is a whole second copy of real data. It is dropped
  // here rather than only at the end of the rehearsal, so a rehearsal that
  // failed halfway does not leave one lying about. WITH (FORCE) because a
  // restore interrupted by Ctrl-C may still be connected to it. Dropped before
  // the per-release file goes, because the compose command reads that file.
  const parts = [];
  if (rehearsing) {
    parts.push(
      `if ! ${composeCmd(stagingEnv)} exec -T db psql -U app -d postgres -q ` +
        `-c 'DROP DATABASE IF EXISTS ${rehearsalDb} WITH (FORCE);' >/dev/null; then`,
      `  echo "could not drop ${rehearsalDb}" >&2; failed=1`,
      'fi',
    );
  }
  parts.push(`rm -f ${q(remoteArchive)} ${q(stagingEnv)}`, 'exit "${failed:-0}"');
  let status = 1;
  console.log('');
  console.log(`tidying up on ${host}`);
  // Synchronous on purpose: this is the last thing that happens, and nothing
  // may interleave with it.
  const result = spawnSync('ssh', ['-o', 'BatchMode=yes', host, 'bash -s'], {
    input: wrapScript(parts.join('\n'), '-uo'),
    encoding: 'utf8',
  });
  if (result.error) {
    console.error(`WARNING: could not reach ${host} to tidy up: ${result.error.message}`);
  } else {
    status = result.status;
  }
  if (status !== 0) {
    console.error(
      `WARNING: could not tidy up on ${host}. Left behind: ${remoteArchive}, ${stagingEnv}` +
        (rehearsing ? `, database ${rehearsalDb}` : '') +
        '. All are safe to delete by hand.',
    );
  } else {
    console.log(
      `removed ${remoteArchive}, ${stagingEnv}` +
        (rehearsing ? ` and the rehearsal database ${rehearsalDb}` : ''),
    );
  }
  releaseLock();
}

// --- the steps --------------------------------------------------------------

function gateCommitIsOnMain() {
  step('commit', `checking that ${short} is a commit on the main branch`);
  if (git(['cat-file', '-e', `${sha}^{commit}`], { allowFailure: true }).status !== 0) {
    throw new Refusal(
      `${sha} is not a commit in this checkout`,
      'Did the commit id get truncated? It is 40 characters. `git log --oneline -5` shows recent ones.',
    );
  }
  const remotes = git(['remote']).out.split('\n').filter(Boolean);
  let reference = 'main';
  if (remotes.includes('origin')) {
    git(['fetch', '-q', 'origin', 'main'], { allowFailure: true });
    reference = 'origin/main';
  } else {
    log('no "origin" remote; checking against the local main branch instead');
  }
  const onMain = git(['merge-base', '--is-ancestor', sha, reference], { allowFailure: true });
  if (onMain.status !== 0) {
    throw new Refusal(
      `${short} is not on ${reference}`,
      'Only what is merged gets released. Merge the branch first, then release the merge commit.',
    );
  }
  log(`${short} is on ${reference}`, {
    subject: JSON.stringify(git(['log', '-1', '--format=%s', sha]).out),
  });
}

// The guard that the 14 September 2026 incident bought. Another agent may have
// released while this one was preparing; deploying an older commit would
// silently withdraw their fix, so what is running has to be an ancestor of what
// is going out.
function gateAncestor(previous, when) {
  if (!previous) {
    log('nothing is deployed yet — this is the first release');
    return 'first';
  }
  if (previous === sha) {
    log(`${short} is already the running release`);
    return 'same';
  }
  if (allowRollback) {
    log(
      `replacing ${previous.slice(0, 7)} — --allow-rollback was passed, so ancestry is not checked`,
    );
    return 'rollback';
  }
  if (git(['cat-file', '-e', `${previous}^{commit}`], { allowFailure: true }).status !== 0) {
    throw new Refusal(
      `the running release ${previous.slice(0, 7)} is not a commit this checkout knows about`,
      'Fetch it (`git fetch --all`), or pass --allow-rollback if you mean to replace it regardless.',
    );
  }
  if (git(['merge-base', '--is-ancestor', previous, sha], { allowFailure: true }).status !== 0) {
    throw new Refusal(
      `${short} does not contain the running release ${previous.slice(0, 7)}${when ? ` (${when})` : ''}`,
      'Releasing it would undo whatever went out in between. Release a newer commit, or\n' +
        'pass --allow-rollback if going back is what you want.',
    );
  }
  log(`replacing ${previous.slice(0, 7)}, which ${short} contains`);
  return 'forward';
}

async function readDeployedRelease() {
  const marker = q(`${dir}/current/RELEASE`);
  return (await remote(`if [ -f ${marker} ]; then cat ${marker}; fi`, { quiet: true })).out;
}

// Two lines of the server's .env that the release needs and that only the
// server knows. Read, never written: .env is the server's, and holds secrets.
async function readServerFacts() {
  const envFile = `${dir}/.env`;
  const out = (
    await remote(
      `
[ -f ${q(envFile)} ] || { echo "${envFile} does not exist — run deploy/server-setup.sh first" >&2; exit 78; }
sed -n -E '/^(APP_SLUG|BACKUP_HOST_DIR)=/p' ${q(envFile)}
`,
      { quiet: true },
    )
  ).out;
  for (const line of out.split('\n')) {
    const [key, ...rest] = line.split('=');
    const value = rest
      .join('=')
      .trim()
      .replace(/^'(.*)'$/, '$1')
      .replace(/^"(.*)"$/, '$1');
    if (key === 'APP_SLUG') server.slug = value;
    if (key === 'BACKUP_HOST_DIR') server.backups = value;
  }
  const missing = [!server.slug && 'APP_SLUG', !server.backups && 'BACKUP_HOST_DIR'].filter(
    Boolean,
  );
  if (missing.length > 0) {
    throw new Refusal(
      `${envFile} has no ${missing.join(' or ')} line`,
      'APP_SLUG names the containers and the database volume; BACKUP_HOST_DIR is where the\n' +
        'dumps go. Re-run deploy/server-setup.sh: it adds the missing lines and leaves every\n' +
        'other line of the file exactly as it is.',
    );
  }
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(server.slug)) {
    throw new Refusal(`APP_SLUG in ${envFile} is "${server.slug}", not a lowercase name`);
  }
  if (!server.backups.startsWith('/')) {
    throw new Refusal(`BACKUP_HOST_DIR in ${envFile} is "${server.backups}", not an absolute path`);
  }
}

async function transfer() {
  step('transfer', `packing ${short} and sending it to ${host}`);
  // git archive, not scp of the working tree: what goes out is exactly the
  // commit, with no local edit, no stray file and no node_modules.
  const archive = spawnSync('git', ['archive', '--format=tar.gz', sha], {
    maxBuffer: 1024 * 1024 * 1024,
    encoding: 'buffer',
  });
  if (archive.status !== 0) throw new Refusal('git archive failed', String(archive.stderr || ''));
  writeFileSync(localArchive, archive.stdout, { mode: 0o600 });
  const digest = createHash('sha256').update(archive.stdout).digest('hex');
  log('packed', { bytes: archive.stdout.length, sha256: digest.slice(0, 16) });

  // Marked before the copy starts, so a transfer interrupted halfway still has
  // its partial file removed.
  transferred = true;
  const copy = await run('scp', [
    '-q',
    '-o',
    'BatchMode=yes',
    localArchive,
    `${host}:${remoteArchive}`,
  ]);
  if (interrupted) throw new Interrupted();
  if (copy.error) throw new Refusal(`could not run scp: ${copy.error.message}`);
  if (copy.status !== 0) throw new Refusal('the transfer failed', copy.stderr);

  // Checked on the far side, because a transfer that silently loses bytes
  // produces a build error twenty minutes later that looks like a code problem.
  const remoteDigest = (
    await remote(`sha256sum ${q(remoteArchive)} | cut -d' ' -f1`, { quiet: true })
  ).out;
  if (remoteDigest !== digest) {
    throw new Refusal(
      'the archive changed during the transfer',
      `sent ${digest}\ngot  ${remoteDigest}\nNothing was installed. Run the same command again.`,
    );
  }
  log('digest matches on the server');

  step('unpack', `unpacking into ${releaseDir}`);
  await remote(`
rm -rf ${q(releaseDir)}
mkdir -p ${q(releaseDir)}
tar -xzf ${q(remoteArchive)} -C ${q(releaseDir)}
test -f ${q(`${releaseDir}/compose.yaml`)}
test -f ${q(`${releaseDir}/Dockerfile`)}
# Which commit this is, where its source lives, and the app's own facts, for
# the steps before the switch. Deliberately a different file from .release.env:
# until the switch, the running release is still the old one and nothing may
# suggest otherwise.
umask 077
printf '%s' ${q(releaseEnvContents)} > ${q(stagingEnv)}
echo unpacked
`);
}

async function build() {
  step('build', 'building the image on the server from this exact commit');
  await remote(`${composeCmd(stagingEnv)} build --build-arg APP_RELEASE=${q(sha)} app`);
  log('image built');
}

async function startDatabase() {
  step('database', 'making sure the database is up');
  // With the live release's compose.yaml whenever there is one. The new file
  // may change the database's image or volume, and that must not reach the
  // real database before the backup exists; the migration is the only thing a
  // release is allowed to change there, and it comes later.
  //
  // Written with `if`, not `[ ... ] && break`: under `set -e` an && list whose
  // left side is false ends the whole script, which would report "the database
  // did not start" the first time round the loop.
  const live = `${dir}/current/compose.yaml`;
  const out = (
    await remote(`
if [ -e ${q(live)} ]; then
  compose() {
    if [ -f ${q(releaseEnv)} ]; then
      docker compose -f ${q(live)} --project-directory ${q(dir)} --env-file ${q(`${dir}/.env`)} --env-file ${q(releaseEnv)} "$@"
    else
      docker compose -f ${q(live)} --project-directory ${q(dir)} --env-file ${q(`${dir}/.env`)} "$@"
    fi
  }
  echo "using the live release's compose.yaml"
else
  compose() { ${composeCmd(stagingEnv)} "$@"; }
  echo "no live release yet; using ${short}'s compose.yaml"
fi
compose up -d --no-deps db
state=unknown
for attempt in $(seq 1 60); do
  state=$(compose ps --format '{{.Health}}' db 2>/dev/null | head -1)
  if [ "$state" = healthy ]; then break; fi
  sleep 2
done
if [ "$state" != healthy ]; then
  echo "the database reports '$state', not healthy, after two minutes" >&2
  exit 75
fi
`)
  ).out;
  for (const line of out.split('\n').filter(Boolean)) log(line);
  log('database healthy');
}

async function backup() {
  step('backup', 'taking a backup before anything changes');
  const out = (await remote(q(`/usr/local/bin/${server.slug}-backup`))).out;
  if (out) console.log(out);
  // backup.sh ends by printing one JSON line naming the file it wrote. That
  // exact file is checked, not "the newest one in the folder", which could be
  // somebody else's.
  const last = out.split('\n').filter(Boolean).pop() ?? '';
  let event = null;
  try {
    event = JSON.parse(last);
  } catch {
    event = null;
  }
  if (event?.event === 'backup_skipped') {
    throw new Refusal(
      `the backup was skipped: ${event.reason}`,
      `${dir}/current/RELEASE names a release, so there is data to protect, but the backup\n` +
        'found nothing to back up. Look at what current points to before releasing again.',
    );
  }
  if (event?.event !== 'backup_completed' || typeof event.file !== 'string') {
    throw new Refusal('the backup did not report a finished dump', out || 'no output');
  }
  // A backup nobody looked at is a habit, not a safety net. The file has to
  // exist, be big enough to be a real dump, and be from minutes ago rather than
  // from last week, before the release goes any further.
  const bytes = (
    await remote(`
f=${q(event.file)}
[ -f "$f" ] || { echo "the backup names $f, and there is no such file" >&2; exit 75; }
bytes=$(wc -c < "$f" | tr -d ' ')
age=$(( $(date +%s) - $(stat -c %Y "$f") ))
[ "$bytes" -ge 1024 ] || { echo "the dump is only $bytes bytes" >&2; exit 75; }
[ "$age" -le 900 ] || { echo "the dump is $age seconds old; the backup did not run" >&2; exit 75; }
printf '%s\\n' "$bytes"
`)
  ).out;
  log('backup verified', { file: event.file, bytes });
  return event.file;
}

// The migration has to be proved against a database that is already at the
// deployed schema version. A release was rolled back on 13 September 2026
// because its migration had only ever run against an empty one — so a restore
// that failed, or produced an empty database, stops the release here rather
// than "proving" the migration against nothing.
async function rehearseMigration(dumpFile) {
  step('rehearsal', 'rehearsing the migration on a fresh copy of the real data');
  rehearsing = true;
  const compose = composeCmd(stagingEnv);
  const restored = (
    await remote(`
${compose} exec -T db psql -U app -d postgres -v ON_ERROR_STOP=1 -q \\
  -c 'DROP DATABASE IF EXISTS ${rehearsalDb} WITH (FORCE);'
${compose} exec -T db psql -U app -d postgres -v ON_ERROR_STOP=1 -q \\
  -c 'CREATE DATABASE ${rehearsalDb} OWNER app;'
# --no-owner: the dump's ownership is irrelevant to a throwaway copy. Into a
# freshly created database a sound dump restores without a single error, so any
# error is the answer: this dump cannot be restored, and nothing is proved.
if ! ${compose} exec -T db pg_restore --no-owner -U app -d ${rehearsalDb} < ${q(dumpFile)} >/dev/null; then
  echo "pg_restore could not restore $(basename ${q(dumpFile)}) into the rehearsal copy; its errors are above" >&2
  exit 75
fi
tables=$(${compose} exec -T db psql -U app -d ${rehearsalDb} -tAc \\
  "select count(*) from information_schema.tables where table_schema = 'public'" | tr -d '[:space:]')
case $tables in
  '' | *[!0-9]*) echo "could not count the tables in the rehearsal copy (got '$tables')" >&2; exit 75 ;;
esac
if [ "$tables" -eq 0 ]; then
  echo "the rehearsal copy holds no tables, so a migration run on it would prove nothing" >&2
  exit 75
fi
echo "$tables"
`)
  ).out;
  log('the copy is restored', { tables: restored });
  // The copy is chosen by APP_DATABASE, which compose.yaml puts into the
  // database address it assembles itself. The password stays where it always
  // is, in .env, and never appears on a command line or in a process list.
  const migration = await remote(
    `APP_DATABASE=${rehearsalDb} ${compose} run --rm --no-deps app node dist/server/src/db/migrate-cli.js`,
    { allowFailure: true },
  );
  if (migration.status !== 0) {
    throw new Refusal(
      'the migration failed against a copy of the real data',
      'Nothing was changed: the live database and the running release are untouched.\n' +
        'The output above is what the migration said. Fix it and release again.\n' +
        `${migration.err || migration.out}`,
    );
  }
  if (migration.out) console.log(migration.out);
  await remote(
    `${compose} exec -T db psql -U app -d postgres -q -c 'DROP DATABASE IF EXISTS ${rehearsalDb} WITH (FORCE);'`,
    { quiet: true },
  );
  rehearsing = false;
  log('the migration runs cleanly on real data');
}

async function migrateForReal(backupFile) {
  step('migrate', 'applying the migration to the live database');
  // The app also migrates when it starts. Running it here first means a
  // migration failure is a message on this screen rather than a container that
  // will not come up after the switch.
  const result = await remote(
    `${composeCmd(stagingEnv)} run --rm --no-deps app node dist/server/src/db/migrate-cli.js`,
    { allowFailure: true },
  );
  if (result.status !== 0) {
    throw new Refusal(
      'the migration failed on the live database',
      (backupFile
        ? 'The previous release is still running and still serving. The rehearsal passed on a\n' +
          'copy of this same data, so this is unexpected — read the output above. The backup\n' +
          `taken minutes ago is ${backupFile}.\n`
        : 'This is the first release, so nothing was serving and there was no data to lose.\n' +
          'Read the output above, fix the migration and release again.\n') +
        `${result.err || result.out}`,
    );
  }
  if (result.out) console.log(result.out);
  log('schema is up to date');
}

let switched = false;

async function switchOver() {
  step('switch', `starting ${short}`);
  // The record of what is live is written the moment the new container is
  // started — not after the check that follows. From here on this commit is
  // what is serving, whether or not it answers well, and the next release's
  // ancestor guard has to judge against it.
  switched = true;
  await remote(`
umask 077
printf '%s' ${q(releaseEnvContents)} > ${q(releaseEnv)}
# The web server reads one Caddyfile at a path that does not change, so that a
# release never restarts it and never interrupts a certificate renewal. It is
# reloaded in place, and only when it actually differs.
if ! cmp -s ${q(`${releaseDir}/Caddyfile`)} ${q(`${dir}/Caddyfile`)} 2>/dev/null; then
  cp ${q(`${releaseDir}/Caddyfile`)} ${q(`${dir}/Caddyfile`)}
  caddyfile_changed=1
else
  caddyfile_changed=
fi
# --no-deps so the database is not recreated underneath the app. This is the
# moment of downtime: the old container stops, the new one starts, and Caddy
# holds arriving requests for up to five seconds while that happens.
${composeCmd(releaseEnv)} up -d --no-deps app
# Recorded now. -n so that an existing symlink is replaced rather than a link
# being created inside the directory it points at, and -f so it is one step.
umask 022
printf '%s\\n' ${q(sha)} > ${q(`${releaseDir}/RELEASE`)}
ln -sfn ${q(releaseDir)} ${q(`${dir}/current`)}
test "$(cat ${q(`${dir}/current/RELEASE`)})" = ${q(sha)}
echo "recorded ${short} as the live release"
# Starts the web server on a first release; does nothing on every release after.
${composeCmd(releaseEnv)} up -d caddy
if [ -n "$caddyfile_changed" ]; then
  ${composeCmd(releaseEnv)} exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  echo "Caddyfile changed and was reloaded"
fi
`);
  log('the new container is running');
  log(`${dir}/current now points at ${short}`);
}

const afterSwitchHint =
  `${short} is recorded as the live release: the new container was started and\n` +
  `${dir}/current names it. Investigate before anything else, and do not release again over\n` +
  'it until you know what is wrong. Read its log:\n' +
  `  ssh ${host} 'docker logs --tail 50 $(docker ps -q -f name=app)'\n` +
  'To go back: pnpm release <the previous commit> --allow-rollback';

async function verify() {
  step('verify', `asking https://${domain} whether it is ready`);
  const deadline = Date.now() + 120_000;
  let lastProblem = 'no answer yet';
  let ready = false;
  while (!ready && Date.now() < deadline) {
    if (interrupted) throw new Interrupted();
    try {
      const response = await fetch(`https://${domain}/health/ready`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) {
        ready = true;
        log('the app answers /health/ready');
        break;
      }
      lastProblem = `HTTP ${response.status}`;
    } catch (error) {
      lastProblem = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  if (!ready) {
    throw new Refusal(
      `the new release is serving but did not answer https://${domain}/health/ready within two minutes (${lastProblem})`,
      afterSwitchHint,
    );
  }

  // Being ready is not the same as being the release that was just started: a
  // container that failed to come up leaves the previous one answering exactly
  // this way. So the release is read back from the thing that is serving.
  step('confirm', 'confirming the running release is the one just sent');
  let running = null;
  try {
    const response = await fetch(`https://${domain}/health/version`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) {
      const body = await response.json();
      if (typeof body?.release === 'string') running = body.release;
    }
  } catch {
    // Falls through to asking the container itself.
  }
  let source = '/health/version';
  if (!running) {
    // The endpoint may not exist in this app yet. The container's own
    // environment is the same fact from one step closer in.
    source = 'the container';
    running = (
      await remote(`${composeCmd(releaseEnv)} exec -T app node -p process.env.APP_RELEASE`, {
        quiet: true,
      })
    ).out;
  }
  if (running !== sha) {
    throw new Refusal(
      `${domain} is serving ${String(running).slice(0, 7) || '(nothing recognisable)'}, not ${short}`,
      `Read from ${source}. The switch did not take as expected.\n${afterSwitchHint}`,
    );
  }
  log(`serving ${short}`, { read_from: source });
}

async function prune() {
  step('prune', 'clearing out what is no longer needed');
  // The release has already happened by now; a prune that fails is worth a
  // warning, not a failed release.
  const result = await remote(
    `
cd ${q(`${dir}/releases`)}
live=$(readlink -f ${q(`${dir}/current`)})
removed=0
# Only names that are a full commit id are ever candidates. Anything else in
# this folder was put there by a person and is left alone.
for entry in $(ls -1dt */ 2>/dev/null | tail -n +6); do
  name=${'${entry%/}'}
  case "$name" in
    [0-9a-f]*) if [ ${'${#name}'} -ne 40 ]; then continue; fi ;;
    *) continue ;;
  esac
  if [ "$(readlink -f "$name")" = "$live" ]; then continue; fi
  rm -rf "$name"
  removed=$((removed + 1))
done
# Dangling images only: the tagged image of every kept release stays, so a
# rollback does not have to build anything.
images=$(docker image prune -f | tail -1)
# The same fourteen days, and the same two kinds of file, as backup.sh keeps.
dumps=$(find ${q(server.backups)} -maxdepth 1 -type f \\( -name 'app-*.dump' -o -name 'pre-restore-app-*.dump' \\) -mtime +14 -print -delete | wc -l | tr -d ' ')
free=$(df -h / | awk 'NR==2 {print $4" free of "$2}')
printf 'releases_removed=%s dumps_removed=%s disk=%s\\n' "$removed" "$dumps" "$free"
printf '%s\\n' "$images"
`,
    { allowFailure: true },
  );
  for (const line of result.out.split('\n').filter(Boolean)) log(line);
  if (result.status !== 0) {
    log('WARNING: the prune did not finish; the release itself is done', { exit: result.status });
  }
}

// --- the plan, for --dry-run ------------------------------------------------

function printPlan(previous, verdict) {
  const first = verdict === 'first';
  console.log('');
  console.log(`Plan for releasing ${short} to ${host} (${domain})`);
  console.log('');
  const lines = [
    `1.  pack commit ${short} with git archive, check its sha256 after the transfer`,
    `2.  unpack into ${releaseDir}, write ${stagingEnv}`,
    `3.  build the image on the server, tagged ${short}`,
    `4.  start the database if it is not already up (with the live compose.yaml when there is one)`,
    first
      ? '5.  skip the backup: this is the first release and there is no data yet'
      : `5.  run /usr/local/bin/${server.slug}-backup and check the dump is real`,
    first
      ? '6.  skip the rehearsal: there is no data to rehearse on'
      : `6.  restore that dump into ${rehearsalDb}, check it holds tables, run the migration against it`,
    `7.  read ${dir}/current/RELEASE again — another release may have gone out meanwhile`,
    `8.  run the migration against the live database`,
    `9.  write ${releaseEnv}, install the Caddyfile if it changed, start the new app container,`,
    `    and record it: write ${releaseDir}/RELEASE, point ${dir}/current at it`,
    `10. wait for https://${domain}/health/ready, then confirm it is serving ${short}`,
    `11. keep the newest 5 releases plus the live one, prune dangling images and dumps over 14 days old`,
  ];
  for (const line of lines) console.log(`  ${line}`);
  console.log('');
  console.log(`  The whole release holds ${lockFile}; a second one started meanwhile is refused.`);
  console.log('  Steps 1 to 8 are gates: if one refuses, the release stops and');
  console.log(
    `  ${previous ? previous.slice(0, 7) : 'whatever is there'} keeps serving. The switch is step 9.`,
  );
  console.log('');
  console.log('  Nothing was done. Run the same command without --dry-run.');
}

// --- and go -----------------------------------------------------------------

async function main() {
  console.log(`releasing ${short} to ${host}  (${domain})`);
  gateCommitIsOnMain();

  // Taken before the running release is read, so that what the ancestor guard
  // judges cannot change underneath it. A dry run changes nothing and needs no
  // lock.
  if (!dryRun) await takeLock();

  step('running', `asking ${host} what is running now`);
  await readServerFacts();
  const previous = await readDeployedRelease();
  const verdict = gateAncestor(previous, null);
  if (verdict === 'same' && !allowRollback) {
    log('nothing to do');
    return;
  }

  if (dryRun) {
    printPlan(previous, verdict);
    return;
  }

  await transfer();
  await build();
  await startDatabase();

  let backupFile = null;
  if (verdict === 'first') {
    step('backup', 'skipping the backup and the rehearsal');
    log('the first release has nothing to back up and no data to rehearse the migration on');
  } else {
    backupFile = await backup();
    await rehearseMigration(backupFile);
  }

  // The build and the rehearsal take minutes, which is long enough for another
  // session to release in the meantime — on 17 September 2026 exactly that
  // happened and the switch quietly withdrew it. The lock now prevents that for
  // every release made with this script; the check stays for anything else.
  step('running', 'checking that nothing was released while this was building');
  const now = await readDeployedRelease();
  if (now !== previous) {
    log(`the running release moved from ${previous || '(none)'} to ${now} during the build`);
    if (now === sha) {
      log('another session released this very commit; nothing left to do');
      return;
    }
    if (!backupFile) {
      throw new Refusal(
        `a release (${now.slice(0, 7)}) appeared on ${host} while this one was building`,
        'This one skipped the backup and the rehearsal because nothing was deployed when it\n' +
          'started. Run the same command again so that both happen.',
      );
    }
    gateAncestor(now, 'it moved during the build');
  } else {
    log('unchanged');
  }

  await migrateForReal(backupFile);
  await switchOver();
  await verify();
  await prune();

  const seconds = Math.round((Date.now() - started) / 1000);
  console.log('');
  console.log('---');
  console.log(`Released ${short} to ${domain} in ${Math.floor(seconds / 60)}m ${seconds % 60}s.`);
  console.log(`  ${git(['log', '-1', '--format=%s', sha]).out}`);
  if (backupFile) {
    console.log(
      `  It replaced ${previous.slice(0, 7)}. The database was backed up first, the migration was`,
    );
    console.log('  rehearsed on a copy of the real data before it was applied, and the site');
    console.log(`  answered as ${short} before this finished.`);
  } else {
    console.log('  This was the first release: there was no data to back up or rehearse on. The');
    console.log(`  database was created, the migration applied, and the site answered as ${short}`);
    console.log('  before this finished.');
  }
  console.log('');
  console.log(`  Open https://${domain} and look at one screen you changed.`);
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  exitCode = interrupted ? 130 : 65;
  console.error('');
  if (interrupted) {
    console.error(`STOPPED at "${currentStep}": interrupted by ${interrupted}`);
    console.error('');
    console.error(
      switched
        ? 'The switch had begun, so the new release may already be serving and recorded as live.\n' +
            `Check with: ssh ${host} 'cat ${dir}/current/RELEASE'\n` +
            'Do not release again over it until you know which one is serving.'
        : 'Nothing was switched: the previous release is still serving and the live database is\n' +
            'as it was. What this release put on the server is removed below.',
    );
  } else if (error instanceof Refusal) {
    console.error(`STOPPED at "${currentStep}": ${error.message}`);
    if (error.hint) console.error('');
    if (error.hint) console.error(error.hint);
  } else {
    console.error(`STOPPED at "${currentStep}": ${error.stack || error.message}`);
  }
  console.error('');
} finally {
  cleanup();
}
process.exit(exitCode);
