// deploy/server-setup.sh run whole, against a scratch folder, with every
// command that would change a machine replaced by a stub that writes down
// what it was asked. The script has still never run on a real server from
// this repository; this is the proof that its two modes do what they say —
// above all that --shared touches nothing but the app's own files.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

const script = path.resolve(import.meta.dirname, '..', 'deploy', 'server-setup.sh');

// One body for every stub: it records the call, then answers the few
// questions the script asks the machine, from environment variables the test
// sets per scenario.
const STUB = `#!/bin/bash
name=$(basename "$0")
printf '%s %s\\n' "$name" "$*" >>"$STUB_LOG"
case $name in
  id)
    case "$*" in
      -u) echo 0 ;;
      "-u deploy") [ "\${STUB_DEPLOY_EXISTS:-1}" = 1 ] && echo 1001 || exit 1 ;;
      "-nG deploy") echo "\${STUB_DEPLOY_GROUPS:-deploy docker}" ;;
    esac ;;
  install)
    mode=; dir=; args=()
    while [ $# -gt 0 ]; do
      case $1 in
        -d) dir=1 ;;
        -m) mode=$2; shift ;;
        -o|-g) shift ;;
        *) args+=("$1") ;;
      esac; shift
    done
    if [ -n "$dir" ]; then mkdir -p "\${args[@]}"; else cp "\${args[0]}" "\${args[1]}"; fi
    [ -n "$mode" ] && chmod "$mode" "\${args[@]}" ;;
  docker)
    case "$*" in
      "compose version") [ "\${STUB_DOCKER_MISSING:-}" = 1 ] && exit 1 || exit 0 ;;
      --version) echo "Docker version 27.1.1, build abc" ;;
      "volume ls -q") printf '%s\\n' \${STUB_VOLUMES:-} ;;
    esac ;;
  dpkg)
    case "$1" in
      -s) case " \${STUB_PACKAGES:-} " in *" $2 "*) exit 0 ;; *) exit 1 ;; esac ;;
      --print-architecture) echo amd64 ;;
    esac ;;
  ufw) [ "$1" = status ] && echo "Status: \${STUB_UFW:-inactive}" ;;
  sshd) [ "$1" = -T ] && echo "passwordauthentication \${STUB_SSH_PASSWORDS:-no}" ;;
  ss) port=\${2##*:}; case " \${STUB_PORTS:-} " in *" :$port "*) echo "LISTEN 0 4096 *:$port *:* users:((\\"nginx\\",pid=1,fd=4))" ;; esac ;;
  systemctl) [ "$1" = show ] && echo "Tue 2026-10-21 03:15:00 UTC" ;;
  curl) while [ $# -gt 0 ]; do [ "$1" = -o ] && echo stub-key >"$2"; shift; done ;;
  *) ;;
esac
exit 0
`;
const STUBBED = [
  'id',
  'install',
  'chown',
  'adduser',
  'usermod',
  'apt-get',
  'systemctl',
  'ufw',
  'sshd',
  'dpkg',
  'curl',
  'docker',
  'ss',
];

function run(args, env = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'server-setup-'));
  const bin = path.join(root, 'bin');
  const sys = path.join(root, 'sys');
  mkdirSync(bin);
  // What a real Ubuntu has before the script runs: the folders the hardening
  // files go into. The files themselves are what the assertions look for.
  mkdirSync(path.join(sys, 'etc', 'ssh', 'sshd_config.d'), { recursive: true });
  mkdirSync(path.join(sys, 'etc', 'apt', 'apt.conf.d'), { recursive: true });
  mkdirSync(path.join(sys, 'root', '.ssh'), { recursive: true });
  writeFileSync(
    path.join(sys, 'etc', 'os-release'),
    'VERSION_ID="24.04"\nVERSION_CODENAME=noble\nPRETTY_NAME="Ubuntu 24.04"\n',
  );
  writeFileSync(path.join(sys, 'root', '.ssh', 'authorized_keys'), 'ssh-ed25519 AAAA test\n');
  for (const name of STUBBED) writeFileSync(path.join(bin, name), STUB, { mode: 0o755 });
  const log = path.join(root, 'calls.log');
  writeFileSync(log, '');
  const result = spawnSync('bash', [script, ...args], {
    encoding: 'utf8',
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      INHOUSE_SETUP_PREFIX: sys,
      STUB_LOG: log,
      ...env,
    },
  });
  return {
    status: result.status,
    out: result.stdout + result.stderr,
    calls: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean),
    root,
    sys,
  };
}

const appDir = (root) => path.join(root, 'app');

describe('server-setup.sh on a shared machine', () => {
  it('makes only the app’s own files and changes nothing on the machine', () => {
    const scratch = mkdtempSync(path.join(tmpdir(), 'shared-'));
    const dir = path.join(scratch, 'srv', 'orders');
    const r = run(
      ['orders', 'orders.example.com', dir, '--shared', '--edge', 'host', '--port', '3001'],
      {
        STUB_UFW: 'active',
        STUB_PACKAGES: 'unattended-upgrades',
        STUB_PORTS: ':80 :443',
      },
    );
    assert.equal(r.status, 0, r.out);
    const changing = r.calls.filter((c) =>
      /^(apt-get|adduser|usermod|sshd -t|systemctl (reload|enable --now (unattended|fail2ban|docker))|ufw (default|allow|--force)|curl)/.test(
        c,
      ),
    );
    assert.deepEqual(changing, [], `shared mode changed the machine: ${changing.join('; ')}`);
    assert.ok(existsSync(path.join(dir, 'releases')));
    assert.ok(existsSync(path.join(r.sys, 'var', 'backups', 'orders')));
    const env = readFileSync(path.join(dir, '.env'), 'utf8');
    assert.match(env, /^APP_SLUG=orders$/m);
    assert.match(env, /^APP_BIND_PORT=3001$/m);
    assert.match(env, /^POSTGRES_PASSWORD=[0-9a-f]{48}$/m);
    assert.ok(existsSync(path.join(r.sys, 'usr', 'local', 'bin', 'orders-backup')));
    assert.ok(existsSync(path.join(r.sys, 'etc', 'systemd', 'system', 'orders-backup.timer')));
    assert.equal(
      existsSync(path.join(r.sys, 'etc', 'ssh', 'sshd_config.d', '99-hardening.conf')),
      false,
      'SSH config was written',
    );
    assert.equal(
      existsSync(path.join(r.sys, 'etc', 'apt', 'apt.conf.d', '51-inhouse-unattended')),
      false,
      'apt config was written',
    );
    assert.match(r.out, /reverse_proxy 127\.0\.0\.1:3001/);
    assert.match(r.out, /not touched on a shared machine/);
    assert.ok(
      r.calls.some((c) => c.startsWith('systemctl enable --now orders-backup.timer')),
      'the timer is this app’s and is enabled',
    );
  });

  it('keeps the settings file exactly as it was on a second run', () => {
    const dir = path.join(mkdtempSync(path.join(tmpdir(), 'shared-')), 'orders');
    const first = run(['orders', 'orders.example.com', dir, '--shared', '--edge', 'host'], {
      STUB_UFW: 'active',
    });
    assert.equal(first.status, 0, first.out);
    const before = readFileSync(path.join(dir, '.env'), 'utf8');
    const second = run(['orders', 'orders.example.com', dir, '--shared', '--edge', 'host'], {
      STUB_UFW: 'active',
    });
    assert.equal(second.status, 0, second.out);
    assert.equal(readFileSync(path.join(dir, '.env'), 'utf8'), before);
    assert.match(second.out, /already done — .*\.env kept/);
  });

  it('insists on an explicit folder', () => {
    const r = run(['orders', 'orders.example.com', '--shared']);
    assert.equal(r.status, 64);
    assert.match(r.out, /folder must be given/);
  });

  it('refuses to take port 443 from whatever already holds it', () => {
    const dir = path.join(mkdtempSync(path.join(tmpdir(), 'shared-')), 'orders');
    const r = run(['orders', 'orders.example.com', dir, '--shared'], {
      STUB_PORTS: ':443',
      STUB_UFW: 'active',
    });
    assert.equal(r.status, 69, r.out);
    assert.match(r.out, /port 443 is already taken: .*nginx/);
    assert.match(r.out, /--edge host/);
    assert.equal(existsSync(path.join(dir, '.env')), false);
  });

  it('refuses a name whose database volume belongs to another folder', () => {
    const dir = path.join(mkdtempSync(path.join(tmpdir(), 'shared-')), 'orders');
    const r = run(['orders', 'orders.example.com', dir, '--shared', '--edge', 'host'], {
      STUB_VOLUMES: 'orders_pgdata other_pgdata',
    });
    assert.equal(r.status, 69, r.out);
    assert.match(r.out, /already uses the name 'orders'/);
  });

  it('stops when Docker is missing rather than installing it', () => {
    const dir = path.join(mkdtempSync(path.join(tmpdir(), 'shared-')), 'orders');
    const r = run(['orders', 'orders.example.com', dir, '--shared', '--edge', 'host'], {
      STUB_DOCKER_MISSING: '1',
    });
    assert.equal(r.status, 69, r.out);
    assert.match(r.out, /Install it/);
    assert.ok(!r.calls.some((c) => c.startsWith('apt-get')));
  });
});

describe('server-setup.sh on a fresh machine', () => {
  it('hardens the machine, installs Docker and makes the app’s files', () => {
    const r = run(['orders', 'orders.example.com'], {
      STUB_DOCKER_MISSING: '1',
      STUB_DEPLOY_EXISTS: '0',
      STUB_DEPLOY_GROUPS: 'deploy',
    });
    // The default folder is /opt/orders, which a test cannot create; the
    // folder step is where it stops, after every machine-wide step has run.
    assert.notEqual(r.status, 0);
    assert.match(r.out, /the application's folders/);
    const calls = r.calls.join('\n');
    assert.match(calls, /^apt-get install .*docker-ce/m);
    assert.match(calls, /^adduser --disabled-password/m);
    assert.match(calls, /^usermod -aG docker deploy/m);
    assert.match(calls, /^ufw --force enable/m);
    assert.match(calls, /^sshd -t/m);
    assert.match(calls, /^systemctl reload ssh/m);
    assert.ok(existsSync(path.join(r.sys, 'etc', 'ssh', 'sshd_config.d', '99-hardening.conf')));
    assert.ok(existsSync(path.join(r.sys, 'etc', 'apt', 'apt.conf.d', '51-inhouse-unattended')));
    assert.ok(existsSync(path.join(r.sys, 'etc', 'apt', 'sources.list.d', 'docker.list')));
  });

  it('stops when ports 80 and 443 are already taken, since its own Caddy needs them', () => {
    const dir = path.join(mkdtempSync(path.join(tmpdir(), 'fresh-')), 'orders');
    const r = run(['orders', 'orders.example.com', dir], {
      STUB_PORTS: ':80 :443',
      STUB_UFW: 'active',
      STUB_PACKAGES: 'fail2ban',
    });
    assert.equal(r.status, 69, r.out);
    assert.match(r.out, /port 80 is already taken/);
  });
});
