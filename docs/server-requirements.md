# What the server needs

Everything the deployment depends on outside the dependency tree. `pnpm-lock.yaml`
records npm packages; nothing records system-level requirements unless they are
written here, and an undocumented one stays invisible until the day the server is
rebuilt and a release fails on a machine that happens to lack it.

**Nothing in this file has been observed on a running server yet.** The kit's
first server does not exist. Every version below is what a fresh Ubuntu 24.04
provides or what `deploy/server-setup.sh` installs; the "Observed" column is
filled in the first time somebody runs it, and this file is corrected then. Say
what you observed, not what you expected — the difference is the whole point of
the column.

Anything added to the server after that goes in the same change that needs it.
That is a rule in `.claude/rules/deploy.md`, not a suggestion.

## Host

One machine: Ubuntu 24.04 LTS on x86-64 or arm64, 2 CPU cores and 4 GB of memory
as a sensible floor. Reached over SSH as the alias in `inhouse.config.json`
(`deploy.host`); the address itself lives in your own `~/.ssh/config` and is
never committed, so the repository names a server without disclosing one.

Three containers share it, with limits set in `compose.yaml` so that none of them
can starve the others: the app (1 core, 768 MB), PostgreSQL (1 core, 768 MB) and
Caddy (half a core, 256 MB). On a 4 GB machine that leaves roughly 2 GB for the
operating system, the page cache and — if you add one — a CI runner.

If the machine runs anything else, never restart or reconfigure it. This project
owns its three containers, `/opt/<app>`, `/var/backups/<app>` and its own systemd
timer, and nothing else.

## System packages

Installed by `deploy/server-setup.sh` unless the note says otherwise.

| Requirement                                   | Expected  | Observed | Used for                                                                                         | Without it                                                                          |
| --------------------------------------------- | --------- | -------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Ubuntu                                        | 24.04 LTS | —        | everything below; supported until 2029                                                           | nothing here has been tried on anything else. The setup script warns and carries on |
| `docker-ce`, `docker-ce-cli`, `containerd.io` | 27.x      | —        | running the app, the database and the web server                                                 | nothing runs                                                                        |
| `docker-compose-plugin`                       | 2.x       | —        | `docker compose`, which every script here invokes                                                | no release, no backup, no restore                                                   |
| `docker-buildx-plugin`                        | 0.x       | —        | building the image from the Dockerfile                                                           | releases cannot build; everything already built keeps running                       |
| `openssl`                                     | 3.0.x     | —        | generating the database password and session secret, once                                        | the settings file cannot be written on first setup                                  |
| `ufw`                                         | 0.36.x    | —        | closing every port except SSH and the web                                                        | the machine answers on every port it happens to be listening on                     |
| `unattended-upgrades`                         | 2.9.x     | —        | applying security updates nightly, rebooting at 04:00 when a kernel needs it                     | the machine falls behind on security patches silently                               |
| `openssh-server`                              | 9.6       | —        | every remote step; it is how releases happen at all                                              | the server is unreachable                                                           |
| `postgresql-client-16` (`psql`, `pg_dump`)    | 16.x      | —        | **only** for looking at the database from the host shell; the real ones run inside the container | nothing breaks. Backups and restores use the client inside the db container         |
| `curl`, `ca-certificates`, `gnupg`            | stock     | —        | adding Docker's apt repository, and checking things by hand                                      | the setup script cannot install Docker                                              |
| `fail2ban`                                    | 1.0.x     | —        | banning addresses that hammer SSH. **Optional** — `SKIP_FAIL2BAN=1` skips it                     | nothing breaks. With password logins already off, this is a belt beside braces      |
| `git`                                         | 2.43      | —        | nothing, on the server. Releases arrive as a tar archive, not a clone                            | nothing. Listed because people expect it to be needed                               |

Ubuntu 24.04 ships Node 26 in its own repositories and this project does not use
it: Node runs **inside** the container, at the version in the Dockerfile, so the
host's Node — if any — is irrelevant. The same goes for pnpm and for PostgreSQL
itself. That is the main thing Docker buys here: exactly one version of each,
recorded in Git, identical on every machine.

## Container images

Pulled from Docker Hub on first use and cached on the machine afterwards.

| Image          | Why that one                                                                                         | Without it                                |
| -------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `node:24-slim` | the base of the app image; `slim` drops build tools the running app never uses                       | nothing builds                            |
| `postgres:16`  | all persistent data. Matches the version tests run against in CI                                     | nothing runs                              |
| `caddy:2`      | HTTPS certificates, fetched and renewed with no configuration; the reverse proxy in front of the app | no HTTPS, and nothing answers on port 443 |

`node:24-slim` has no `wget` and no `curl`. That is why the app's health check in
`compose.yaml` is a line of JavaScript rather than a call to either — adding a
package so a health check can run would widen the attack surface of the one
container that faces the internet.

## Users and permissions

| Thing                 | What it is                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy`              | the only account used after setup. Owns `/opt/<app>` and `/var/backups/<app>`, runs the nightly backup, and is what `pnpm release` logs in as                                         |
| `deploy` in `docker`  | **root-equivalent.** Anyone in the `docker` group can start a container that mounts the whole filesystem as root. Treat its SSH key exactly as you would treat root's                 |
| `root` login          | disabled over SSH (`PermitRootLogin no`)                                                                                                                                              |
| passwords over SSH    | disabled (`PasswordAuthentication no`), in `/etc/ssh/sshd_config.d/99-hardening.conf` — a separate file, because an Ubuntu upgrade replaces the main one and would undo an edit there |
| `node` inside the app | the container runs as an unprivileged user, not root                                                                                                                                  |

After setup, nothing this project does needs `sudo`. If a step seems to, it is
probably touching something that is not this project's.

## Network

| Port    | Open to      | Why                                                                                      |
| ------- | ------------ | ---------------------------------------------------------------------------------------- |
| 22/tcp  | the internet | SSH. Key-only                                                                            |
| 80/tcp  | the internet | Let's Encrypt's check, and the redirect to HTTPS                                         |
| 443/tcp | the internet | the app                                                                                  |
| 443/udp | the internet | the same, over HTTP/3                                                                    |
| 5432    | **nothing**  | the database has no `ports:` entry at all and is reachable only from the app's container |

Worth knowing, because it surprises people: **a container that publishes a port
bypasses ufw.** Docker writes its rules in a table the firewall's rules sit above,
so `ufw deny incoming` does not stop a published port. That is why only Caddy
publishes any, and why the database's entry in `compose.yaml` carries a comment
saying so. To reach the database from a laptop, use an SSH tunnel — see
`deploy/db-readonly.sh`, which prints the command.

## Filesystem layout

| Path                               | What                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `/opt/<app>/.env`                  | settings and secrets, mode 600, owned by `deploy`. Written once, never rewritten     |
| `/opt/<app>/.release.env`          | which commit is live and where its source is. Written at the moment of the switch    |
| `/opt/<app>/.staging.env`          | the same, for a release that has not switched yet. Removed when the release ends     |
| `/opt/<app>/releases/<sha>/`       | the unpacked source of one release. Small — a few MB; the built code is in the image |
| `/opt/<app>/current`               | a symlink to the live release. `current/RELEASE` holds its commit id                 |
| `/opt/<app>/Caddyfile`             | the live web-server config, copied from the release when it changes                  |
| `/var/backups/<app>/`              | nightly dumps, kept 14 days. `/opt/<app>/backups` is a symlink to it                 |
| Docker volume `pgdata`             | **the database.** The one thing on this machine that cannot be rebuilt from Git      |
| Docker volume `appdata`            | uploaded files                                                                       |
| Docker volumes `caddy_data/config` | HTTPS certificates and the account key with Let's Encrypt                            |

Every release prunes: the newest five release folders plus the live one are kept,
dangling images are removed, and dumps over fourteen days old go. This is not
housekeeping for its own sake — on the project this kit grew out of, 136 unpruned
releases once held 45 GB on a disk that was 92% full, with under a day of room
left.

## Scheduled work

| Unit                  | When                     | What                                                                       |
| --------------------- | ------------------------ | -------------------------------------------------------------------------- |
| `<app>-backup.timer`  | 03:15 daily, ±5 min      | `pg_dump` of the database into `/var/backups/<app>`, 14 days kept          |
| `unattended-upgrades` | nightly; reboot at 04:00 | security updates; the containers come back by themselves after a reboot    |
| Caddy's own renewal   | continuous               | HTTPS certificates, about 30 days before each expires. Nothing to schedule |

The backup timer has `Persistent=true`, so a machine that was off or rebooting at
03:15 runs it as soon as it is back. Without that line a server rebooting nightly
can go weeks with no backup and nothing to show for it but a timer marked
"enabled".

## Optional: a CI runner on this machine

`deploy/runner-setup.sh` installs a self-hosted GitHub Actions runner here. The
reason is money: a private repository gets 2,000 free minutes a month, and a
project under daily development can spend those in the first week.

It is constrained by a systemd drop-in — `CPUQuota=100%` (one core's worth),
`MemoryMax=1G`, `Nice=10`, idle I/O — so that a test run cannot make the app slow
for real people. It registers as `--ephemeral`, taking one job and then replacing
itself, so nothing one job leaves behind reaches the next.

**Private repositories only.** A self-hosted runner on a public repository runs
code from anyone's pull request on this machine.
