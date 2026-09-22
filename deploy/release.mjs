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
// Every step below is a gate. Until the switch — step 8 of 11 — a failure
// leaves the previous release serving and the database untouched; the script
// stops, says which gate refused and why, and cleans up after itself whatever
// happened. The gates exist because each of them was once the thing that was
// missing:
//
//   - the archive digest, because a truncated transfer looks like a build error
//   - the ancestor guard, because on 14 September 2026 a release deployed over
//     a newer one and silently withdrew somebody's fix for thirteen minutes
//   - the second ancestor check after the build, because on 17 September 2026
//     another session released during the rehearsal and the switch undid it
//   - the backup before anything changes, because "we can always go back" is
//     only true if somebody made it true earlier
//   - the migration rehearsal on a restored copy, because a migration proved
//     against an empty database is not proved (13 September 2026)
//   - the cleanup on every exit, because until 19 September 2026 it was the
//     last line of a script that only reached its last line on success, and
//     twenty-one abandoned build trees were holding 5.8 GB of a 92% full disk
//   - the prune, for the same reason, from the other end

import { spawnSync } from 'node:child_process';
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
  return {
    host: deploy.host.trim(),
    dir: deploy.dir.trim().replace(/\/$/, ''),
    domain: deploy.domain.trim(),
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
const stagingEnv = `${dir}/.staging.env`;
const releaseEnv = `${dir}/.release.env`;
const rehearsalDb = 'app_rehearsal';

// --- running things ---------------------------------------------------------

// Single-quote for the shell. Every value that reaches a remote command goes
// through this, so a path with a space in it is a path with a space in it and
// not two arguments.
const q = (value) => `'${String(value).replaceAll("'", `'\\''`)}'`;

// Each remote step is one SSH connection running one script under
// `set -euo pipefail`, fed on stdin. One connection per step rather than a
// shell kept open: a dropped connection then fails one step loudly instead of
// leaving half a step done quietly.
function remote(script, { allowFailure = false, quiet = false } = {}) {
  const full = `set -euo pipefail\n${script}\n`;
  const result = spawnSync('ssh', ['-o', 'BatchMode=yes', host, 'bash -s'], {
    input: full,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) throw new Refusal(`could not run ssh: ${result.error.message}`);
  const out = (result.stdout || '').toString();
  const err = (result.stderr || '').toString();
  if (!quiet && err.trim()) console.error(err.trimEnd());
  if (result.status !== 0 && !allowFailure) {
    throw new Refusal(
      `the server refused this step (exit ${result.status})`,
      (err.trim() || out.trim() || 'no output').split('\n').slice(-12).join('\n'),
    );
  }
  return { status: result.status, out: out.trim(), err: err.trim() };
}

// The compose invocation, spelled once. Two --env-file flags because passing
// any --env-file replaces the .env Compose would read on its own, and the two
// files hold different halves of what compose.yaml needs: .env has the database
// password, the staging/release file has which commit this is and where its
// source sits.
function composeCmd(envFile) {
  return (
    `docker compose -f ${q(`${releaseDir}/compose.yaml`)} --project-directory ${q(dir)} ` +
    `--env-file ${q(`${dir}/.env`)} --env-file ${q(envFile)}`
  );
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
  if (!transferred && !rehearsing) return;
  // The rehearsal database is a whole second copy of real data. It is dropped
  // here rather than only at the end of the rehearsal, so a rehearsal that
  // failed halfway does not leave one lying about — and only when the rehearsal
  // was actually reached, so an early failure cannot pull the database out from
  // under a release running in another session.
  const parts = [`rm -f ${q(remoteArchive)} ${q(stagingEnv)}`];
  if (rehearsing) {
    parts.push(
      `${composeCmd(`${dir}/.env`)} exec -T db psql -U app -d postgres ` +
        `-c 'DROP DATABASE IF EXISTS ${rehearsalDb};' >/dev/null 2>&1 || true`,
    );
  }
  let status = 1;
  try {
    status = remote(parts.join('\n'), { allowFailure: true, quiet: true }).status;
  } catch (error) {
    console.error(`WARNING: could not reach ${host} to tidy up: ${error.message}`);
  }
  if (status !== 0) {
    console.error(
      `WARNING: could not tidy up on ${host}. Left behind: ${remoteArchive}, ${stagingEnv}` +
        (rehearsing ? `, database ${rehearsalDb}` : '') +
        '. All are safe to delete by hand.',
    );
  }
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

function readDeployedRelease() {
  return remote(`cat ${q(`${dir}/current/RELEASE`)} 2>/dev/null || true`, { quiet: true }).out;
}

function transfer() {
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

  const copy = spawnSync(
    'scp',
    ['-q', '-o', 'BatchMode=yes', localArchive, `${host}:${remoteArchive}`],
    {
      encoding: 'utf8',
    },
  );
  if (copy.error) throw new Refusal(`could not run scp: ${copy.error.message}`);
  if (copy.status !== 0) throw new Refusal('the transfer failed', String(copy.stderr || ''));
  transferred = true;

  // Checked on the far side, because a transfer that silently loses bytes
  // produces a build error twenty minutes later that looks like a code problem.
  const remoteDigest = remote(`sha256sum ${q(remoteArchive)} | cut -d' ' -f1`, { quiet: true }).out;
  if (remoteDigest !== digest) {
    throw new Refusal(
      'the archive changed during the transfer',
      `sent ${digest}\ngot  ${remoteDigest}\nNothing was installed. Run the same command again.`,
    );
  }
  log('digest matches on the server');

  step('unpack', `unpacking into ${releaseDir}`);
  remote(`
rm -rf ${q(releaseDir)}
mkdir -p ${q(releaseDir)}
tar -xzf ${q(remoteArchive)} -C ${q(releaseDir)}
test -f ${q(`${releaseDir}/compose.yaml`)}
test -f ${q(`${releaseDir}/Dockerfile`)}
# Which commit this is and where its source lives, for the steps before the
# switch. Deliberately a different file from .release.env: until the switch, the
# running release is still the old one and nothing may suggest otherwise.
umask 077
printf 'APP_RELEASE=%s\\nAPP_SOURCE=%s\\n' ${q(sha)} ${q(releaseDir)} > ${q(stagingEnv)}
echo unpacked
`);
}

function build() {
  step('build', 'building the image on the server from this exact commit');
  remote(`${composeCmd(stagingEnv)} build --build-arg APP_RELEASE=${q(sha)} app`);
  log('image built');
}

function startDatabase() {
  step('database', 'making sure the database is up');
  // Written with `if`, not `[ ... ] && break`: under `set -e` an && list whose
  // left side is false ends the whole script, which would report "the database
  // did not start" the first time round the loop.
  remote(`
${composeCmd(stagingEnv)} up -d --no-deps db
state=unknown
for attempt in $(seq 1 60); do
  state=$(${composeCmd(stagingEnv)} ps --format '{{.Health}}' db 2>/dev/null | head -1 || true)
  if [ "$state" = healthy ]; then break; fi
  sleep 2
done
if [ "$state" != healthy ]; then
  echo "the database reports '$state', not healthy, after two minutes" >&2
  exit 75
fi
echo healthy
`);
  log('database healthy');
}

function backup() {
  step('backup', 'taking a backup before anything changes');
  const out = remote(`/usr/local/bin/${appName()}-backup`);
  if (out.out) console.log(out.out);
  // A backup nobody looked at is a habit, not a safety net. The file has to
  // exist, be big enough to be a real dump, and be from minutes ago rather than
  // from last week, before the release goes any further.
  const check = remote(
    `
newest=$(ls -1t ${q(`/var/backups/${appName()}`)}/app-*.dump 2>/dev/null | head -1 || true)
[ -n "$newest" ] || { echo "no dump was written" >&2; exit 75; }
bytes=$(wc -c < "$newest")
age=$(( $(date +%s) - $(stat -c %Y "$newest") ))
[ "$bytes" -ge 1024 ] || { echo "the newest dump is only $bytes bytes" >&2; exit 75; }
[ "$age" -le 900 ] || { echo "the newest dump is $age seconds old; the backup did not run" >&2; exit 75; }
printf '%s %s\\n' "$newest" "$bytes"
`,
  ).out;
  const [file, bytes] = check.split(' ');
  log('backup verified', { file, bytes });
  return file;
}

// The migration has to be proved against a database that is already at the
// deployed schema version. A release was rolled back on 13 September 2026
// because its migration had only ever run against an empty one.
function rehearseMigration(dumpFile) {
  step('rehearsal', 'rehearsing the migration on a fresh copy of the real data');
  rehearsing = true;
  const compose = composeCmd(stagingEnv);
  remote(`
${compose} exec -T db psql -U app -d postgres -v ON_ERROR_STOP=1 -q \\
  -c 'DROP DATABASE IF EXISTS ${rehearsalDb};'
${compose} exec -T db psql -U app -d postgres -v ON_ERROR_STOP=1 -q \\
  -c 'CREATE DATABASE ${rehearsalDb} OWNER app;'
# --no-owner: the dump's ownership is irrelevant to a throwaway copy, and
# insisting on it is the usual reason a restore reports errors that do not matter.
${compose} exec -T db pg_restore --no-owner -U app -d ${rehearsalDb} < ${q(dumpFile)} >/dev/null 2>&1 || true
echo restored
`);
  const password = remote(`grep -m1 '^POSTGRES_PASSWORD=' ${q(`${dir}/.env`)} | cut -d= -f2-`, {
    quiet: true,
  }).out;
  if (!password) {
    throw new Refusal(
      `POSTGRES_PASSWORD is not set in ${dir}/.env`,
      'Re-run deploy/server-setup.sh.',
    );
  }
  const url = `postgres://app:${password}@db:5432/${rehearsalDb}`;
  const migration = remote(
    `${compose} run --rm --no-deps -e DATABASE_URL=${q(url)} app node dist/server/src/db/migrate-cli.js`,
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
  remote(
    `${compose} exec -T db psql -U app -d postgres -q -c 'DROP DATABASE IF EXISTS ${rehearsalDb};'`,
    { allowFailure: true, quiet: true },
  );
  rehearsing = false;
  log('the migration runs cleanly on real data');
}

function migrateForReal() {
  step('migrate', 'applying the migration to the live database');
  // The app also migrates when it starts. Running it here first means a
  // migration failure is a message on this screen rather than a container that
  // will not come up after the switch.
  const result = remote(
    `${composeCmd(stagingEnv)} run --rm --no-deps app node dist/server/src/db/migrate-cli.js`,
    { allowFailure: true },
  );
  if (result.status !== 0) {
    throw new Refusal(
      'the migration failed on the live database',
      'The previous release is still running and still serving. The rehearsal passed on a\n' +
        'copy of this same data, so this is unexpected — read the output above, and the\n' +
        `backup taken minutes ago is in /var/backups.\n${result.err || result.out}`,
    );
  }
  if (result.out) console.log(result.out);
  log('schema is up to date');
}

function switchOver() {
  step('switch', `starting ${short}`);
  remote(`
umask 077
printf 'APP_RELEASE=%s\\nAPP_SOURCE=%s\\n' ${q(sha)} ${q(releaseDir)} > ${q(releaseEnv)}
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
# Starts the web server on a first release; does nothing on every release after.
${composeCmd(releaseEnv)} up -d caddy
if [ -n "$caddyfile_changed" ]; then
  ${composeCmd(releaseEnv)} exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  echo "Caddyfile changed and was reloaded"
fi
echo switched
`);
  log('the new container is running');
}

async function verify() {
  step('verify', `asking https://${domain} whether it is ready`);
  const deadline = Date.now() + 120_000;
  let lastProblem = 'no answer yet';
  let ready = false;
  while (!ready && Date.now() < deadline) {
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
      `https://${domain}/health/ready did not answer within two minutes (${lastProblem})`,
      'The new container is running but is not serving. Read its log:\n' +
        `  ssh ${host} 'docker logs --tail 50 $(docker ps -q -f name=app)'\n` +
        `To go back: pnpm release <the previous commit> --allow-rollback`,
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
    running = remote(`${composeCmd(releaseEnv)} exec -T app node -p process.env.APP_RELEASE`, {
      quiet: true,
    }).out;
  }
  if (running !== sha) {
    throw new Refusal(
      `${domain} is serving ${String(running).slice(0, 7) || '(nothing recognisable)'}, not ${short}`,
      `Read from ${source}. The switch did not take. The previous release is probably still\n` +
        'running, which means people are not affected, but this release did not happen.',
    );
  }
  log(`serving ${short}`, { read_from: source });
}

function markCurrent() {
  step('record', 'recording which release is live');
  remote(`
printf '%s\\n' ${q(sha)} > ${q(`${releaseDir}/RELEASE`)}
# -n so that an existing symlink is replaced rather than a link being created
# inside the directory it points at, and -f so the replacement is in one step.
ln -sfn ${q(releaseDir)} ${q(`${dir}/current`)}
test "$(cat ${q(`${dir}/current/RELEASE`)})" = ${q(sha)}
echo recorded
`);
  log(`${dir}/current now points at ${short}`);
}

function prune() {
  step('prune', 'clearing out what is no longer needed');
  const out = remote(`
cd ${q(`${dir}/releases`)}
live=$(readlink -f ${q(`${dir}/current`)} 2>/dev/null || true)
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
images=$(docker image prune -f 2>/dev/null | tail -1 || true)
dumps=$(find ${q(`/var/backups/${appName()}`)} -maxdepth 1 -type f -name 'app-*.dump' -mtime +14 -print -delete 2>/dev/null | wc -l)
free=$(df -h / | awk 'NR==2 {print $4" free of "$2}')
printf 'releases_removed=%s dumps_removed=%s disk=%s\\n' "$removed" "$dumps" "$free"
printf '%s\\n' "$images"
`).out;
  for (const line of out.split('\n').filter(Boolean)) log(line);
}

function appName() {
  // /opt/<app> by convention; the backup wrapper on the server is named after it.
  return dir.split('/').filter(Boolean).pop();
}

// --- the plan, for --dry-run ------------------------------------------------

function printPlan(previous) {
  console.log('');
  console.log(`Plan for releasing ${short} to ${host} (${domain})`);
  console.log('');
  const lines = [
    `1.  pack commit ${short} with git archive, check its sha256 after the transfer`,
    `2.  unpack into ${releaseDir}`,
    `3.  build the image on the server, tagged ${short}`,
    `4.  start the database if it is not already up, wait for it to report healthy`,
    `5.  run /usr/local/bin/${appName()}-backup and check the dump is real`,
    `6.  restore that dump into ${rehearsalDb} and run the migration against it`,
    `7.  read ${dir}/current/RELEASE again — another release may have gone out meanwhile`,
    `8.  run the migration against the live database`,
    `9.  write ${releaseEnv}, install the Caddyfile if it changed, start the new app container`,
    `10. wait for https://${domain}/health/ready, then confirm it is serving ${short}`,
    `11. write ${releaseDir}/RELEASE, point ${dir}/current at it`,
    `12. keep the newest 5 releases plus the live one, prune dangling images and dumps over 14 days old`,
  ];
  for (const line of lines) console.log(`  ${line}`);
  console.log('');
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

  step('running', `asking ${host} what is running now`);
  const previous = readDeployedRelease();
  const verdict = gateAncestor(previous, null);
  if (verdict === 'same' && !allowRollback) {
    log('nothing to do');
    return;
  }

  if (dryRun) {
    printPlan(previous);
    return;
  }

  transfer();
  build();
  startDatabase();
  const dumpFile = backup();
  rehearseMigration(dumpFile);

  // The build and the rehearsal take minutes, which is long enough for another
  // session to release in the meantime — on 17 September 2026 exactly that
  // happened and the switch quietly withdrew it. So the running release is read
  // once more, and the same rule applies.
  step('running', 'checking that nothing was released while this was building');
  const now = readDeployedRelease();
  if (now !== previous) {
    log(`the running release moved from ${previous || '(none)'} to ${now} during the build`);
    if (now === sha) {
      log('another session released this very commit; nothing left to do');
      return;
    }
    gateAncestor(now, 'it moved during the build');
  } else {
    log('unchanged');
  }

  migrateForReal();
  switchOver();
  await verify();
  markCurrent();
  prune();

  const seconds = Math.round((Date.now() - started) / 1000);
  console.log('');
  console.log('---');
  console.log(`Released ${short} to ${domain} in ${Math.floor(seconds / 60)}m ${seconds % 60}s.`);
  console.log(`  ${git(['log', '-1', '--format=%s', sha]).out}`);
  console.log(
    previous
      ? `  It replaced ${previous.slice(0, 7)}. The database was backed up first, the migration was`
      : '  This was the first release. The database was backed up first, the migration was',
  );
  console.log('  rehearsed on a copy of the real data before it was applied, and the site');
  console.log(`  answered as ${short} before this finished.`);
  console.log('');
  console.log(`  Open https://${domain} and look at one screen you changed.`);
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  exitCode = 65;
  console.error('');
  if (error instanceof Refusal) {
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
