#!/bin/bash
# Turn a brand-new Ubuntu 24.04 machine into one that can run this application.
# Run it once, as root, from your own laptop:
#
#   ssh root@<the server's IP address> 'bash -s' <app name> <domain> [folder] \
#     < deploy/server-setup.sh
#
# for example
#
#   ssh root@203.0.113.10 'bash -s' orders orders.example.com \
#     < deploy/server-setup.sh
#
# The folder is optional and defaults to /opt/<app name>. Give it only if
# `deploy.dir` in inhouse.config.json says something else; the two must agree,
# because that is the folder `pnpm release` will deploy into.
#
# A server that already hosts something else takes --shared:
#
#   ssh root@203.0.113.10 'bash -s' orders orders.example.com /srv/orders \
#     --shared < deploy/server-setup.sh
#
# In that mode the folder must be given, and the machine itself is left alone:
# SSH, the firewall, updates, fail2ban and Docker are checked and reported,
# never changed, and only this app's folder, settings, backup and timer are
# made. Add --edge host when the server already has a web server on ports 80
# and 443: the app then listens on 127.0.0.1 only (port 3000, or --port N) and
# the summary prints the block to add to that web server's configuration;
# `deploy.edge` in inhouse.config.json must say "host" too.
#
# It is safe to run again. Every step checks whether it has already been done
# and says "already done" instead of doing it twice; nothing here ever touches
# the database or its backups. If it stops halfway, fix what it complained about
# and run the same line again.
#
# What it does NOT do: fetch the application, build it or start it. That is
# `pnpm release <sha>`, and the summary at the end tells you so.
#
# INHOUSE_SETUP_PREFIX exists for the script's own test (scripts/server-setup.
# test.mjs), which runs it against a scratch folder with the system commands
# stubbed; it prefixes every system path and is never set on a real server.
set -euo pipefail

usage() {
	echo "usage: ssh root@IP 'bash -s' <app-name> <domain> [folder] [--shared] [--edge own|host] [--port N] < deploy/server-setup.sh" >&2
	echo "  app-name: lowercase letters, digits and dashes, e.g. orders" >&2
	echo "  domain:   the name people will type, e.g. orders.example.com" >&2
	echo "  folder:   optional, /opt/<app-name> by default; must match deploy.dir" >&2
	echo "            in inhouse.config.json. Required with --shared" >&2
	echo "  --shared: the machine already hosts something; touch only this app's files" >&2
	echo "  --edge host: the machine already has a web server on 80/443; the app" >&2
	echo "            listens on 127.0.0.1:<port> for it (deploy.edge must say host)" >&2
	exit 64
}

shared=
edge=own
port=3000
positional=()
while [ $# -gt 0 ]; do
	case $1 in
	--shared) shared=1 ;;
	--edge)
		edge=${2:-}
		shift
		;;
	--port)
		port=${2:-}
		shift
		;;
	--*) usage ;;
	*) positional+=("$1") ;;
	esac
	shift
done
app=${positional[0]:-}
domain=${positional[1]:-}
dir=${positional[2]:-}
if [ -z "$dir" ]; then
	if [ -n "$shared" ]; then
		echo "with --shared the folder must be given: a shared machine has no default place" >&2
		usage
	fi
	dir=/opt/$app
fi
if [[ ! $app =~ ^[a-z][a-z0-9-]{1,30}$ ]] || [ -z "$domain" ] || [[ ! $dir =~ ^/[A-Za-z0-9._/-]+$ ]]; then
	usage
fi
if [ "$edge" != own ] && [ "$edge" != host ]; then
	echo "--edge takes 'own' (the kit's Caddy, the default) or 'host' (the machine's own web server)" >&2
	usage
fi
if [[ ! $port =~ ^[0-9]{2,5}$ ]]; then
	echo "--port takes a port number, e.g. 3001" >&2
	usage
fi
[ "$(id -u)" -eq 0 ] || {
	echo "run this as root; it installs packages and system services" >&2
	exit 77
}

sys=${INHOUSE_SETUP_PREFIX:-}
backups=$sys/var/backups/$app
say() { printf '     %s\n' "$*"; }
step() { printf '\n[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
# The port a listener holds, from the kernel's own table. Empty when free.
listener_on() { ss -Hltn "sport = :$1" 2>/dev/null | head -1; }

step "checking the machine"
. "$sys/etc/os-release"
if [ "${VERSION_ID:-}" != "24.04" ]; then
	say "WARNING: this is ${PRETTY_NAME:-an unknown system}, not Ubuntu 24.04."
	say "It may work. Nothing below has been tried on it."
else
	say "Ubuntu 24.04 — as expected"
fi
say "app name '$app', domain '$domain', folder '$dir'"
if [ -n "$shared" ]; then
	say "shared machine: the system is checked, not changed; only $dir, $backups,"
	say "the backup timer and the settings file are this app's"
fi
if [ "$edge" = host ]; then
	say "the machine's own web server fronts the app, which listens on 127.0.0.1:$port"
	if [ -z "$(listener_on 443)" ]; then
		say "WARNING: nothing is listening on 443 yet; whatever will has to proxy to the app"
	fi
else
	for p in 80 443; do
		if [ -n "$(listener_on "$p")" ] && [ ! -f "$dir/.env" ]; then
			say "port $p is already taken: $(listener_on "$p")"
			say "The kit's own Caddy needs 80 and 443. Either stop what holds them, or run"
			say "again with --edge host and let that web server proxy to the app."
			exit 69
		fi
	done
fi
# The slug names every container and volume, so a volume already carrying it
# belongs to an app that was set up before — under this folder if its settings
# file is here, under another folder (or another name for the same thing) if
# not. Starting a second app on top of the first's database is the one mistake
# this script must never make.
if command -v docker >/dev/null 2>&1 && [ ! -f "$dir/.env" ] &&
	docker volume ls -q 2>/dev/null | grep -qx "${app}_pgdata"; then
	say "a Docker volume named ${app}_pgdata already exists, but $dir has no settings file."
	say "Another app on this machine already uses the name '$app'. Choose a different"
	say "app name, or give the folder that app was set up in."
	exit 69
fi

step "installing the basics"
if [ -n "$shared" ]; then
	missing=
	for tool in curl openssl ss; do
		command -v "$tool" >/dev/null 2>&1 || missing="$missing $tool"
	done
	if [ -n "$missing" ]; then
		say "WARNING: not installed, and not installed here on a shared machine:$missing"
	else
		say "curl openssl ss — present; nothing installed on a shared machine"
	fi
else
	export DEBIAN_FRONTEND=noninteractive
	apt-get update -qq
	# --no-install-recommends keeps this to what is named and nothing suggested.
	apt-get install -y -qq --no-install-recommends \
		ca-certificates curl gnupg openssl ufw unattended-upgrades \
		apt-listchanges postgresql-client-16 >/dev/null
	say "ca-certificates curl gnupg openssl ufw unattended-upgrades psql — present"
fi

step "creating the 'deploy' user"
# Everything after the first install happens as this user over SSH. It is in the
# docker group, which is root-equivalent on any machine: a member can start a
# container that mounts the whole filesystem. Treat its SSH key exactly as you
# would treat root's.
if id -u deploy >/dev/null 2>&1; then
	say "already done — the user exists"
else
	adduser --disabled-password --gecos '' deploy >/dev/null
	say "created"
fi
install -d -m 700 -o deploy -g deploy "$sys/home/deploy/.ssh"
if [ -s "$sys/root/.ssh/authorized_keys" ]; then
	# The key you are logged in with right now. Copied rather than generated, so
	# there is no new secret to move around and nothing to lose.
	if [ -n "$shared" ] && [ -s "$sys/home/deploy/.ssh/authorized_keys" ]; then
		say "deploy already has keys; on a shared machine they are left as they are"
	else
		install -m 600 -o deploy -g deploy "$sys/root/.ssh/authorized_keys" "$sys/home/deploy/.ssh/authorized_keys"
		say "your SSH key copied to deploy ($(wc -l <"$sys/root/.ssh/authorized_keys") key(s))"
	fi
else
	say "WARNING: root has no authorized_keys, so deploy has no key either."
	say "Add yours to /home/deploy/.ssh/authorized_keys before locking SSH down."
fi

step "locking down SSH"
# A separate file under sshd_config.d rather than an edit to sshd_config: an
# Ubuntu upgrade replaces the main file and would silently undo an edit there.
hardening=$sys/etc/ssh/sshd_config.d/99-hardening.conf
desired=$(
	cat <<-'CONF'
		# Written by deploy/server-setup.sh. Passwords are guessable and are guessed,
		# constantly, by machines that scan the whole internet. Keys are not.
		PasswordAuthentication no
		KbdInteractiveAuthentication no
		PermitRootLogin no
		X11Forwarding no
	CONF
)
if [ -f "$hardening" ] && [ "$(cat "$hardening")" = "$desired" ]; then
	say "already done"
elif [ -n "$shared" ]; then
	# Somebody else's SSH configuration is somebody else's. Reported, not fixed.
	if sshd -T 2>/dev/null | grep -qi '^passwordauthentication no'; then
		say "key-only sign-in is on — not touched on a shared machine"
	else
		say "WARNING: password sign-in appears to be on. Not changed on a shared"
		say "machine; whoever runs it should turn it off."
	fi
else
	printf '%s\n' "$desired" >"$hardening"
	chmod 644 "$hardening"
	# Refuse to reload a configuration sshd cannot parse; that is how a machine
	# locks everyone out of itself.
	sshd -t
	systemctl reload ssh
	say "key-only sign-in, no root login — and you are still connected, so it works"
fi

step "the firewall"
if ufw status 2>/dev/null | grep -q '^Status: active'; then
	say "already done — active"
elif [ -n "$shared" ]; then
	say "WARNING: ufw is not active. Not changed on a shared machine: a firewall"
	say "turned on from here could cut off whatever else runs on it."
else
	ufw default deny incoming >/dev/null
	ufw default allow outgoing >/dev/null
	ufw allow 22/tcp >/dev/null
	ufw allow 80/tcp >/dev/null
	ufw allow 443/tcp >/dev/null
	ufw allow 443/udp >/dev/null
	ufw --force enable >/dev/null
	say "deny incoming, except 22 (SSH), 80 and 443 (the web)"
fi
# Worth knowing and not obvious: a container that publishes a port writes its
# own rule below ufw's, so ufw does not protect it. Only Caddy publishes ports
# in this project, and compose.yaml says so where the database is defined.
if [ "$edge" = host ]; then
	say "note: the app publishes 127.0.0.1:$port only, which is not reachable from outside"
else
	say "note: published container ports bypass ufw — only Caddy publishes any"
fi

step "automatic security updates"
auto=$sys/etc/apt/apt.conf.d/51-inhouse-unattended
if [ -f "$auto" ]; then
	say "already done"
elif [ -n "$shared" ]; then
	if dpkg -s unattended-upgrades >/dev/null 2>&1; then
		say "unattended-upgrades is installed — its settings are not touched on a shared machine"
	else
		say "WARNING: unattended-upgrades is not installed; security updates are nobody's"
	fi
else
	cat >"$auto" <<-'CONF'
		// Written by deploy/server-setup.sh.
		APT::Periodic::Update-Package-Lists "1";
		APT::Periodic::Unattended-Upgrade "1";
		Unattended-Upgrade::Automatic-Reboot "true";
		Unattended-Upgrade::Automatic-Reboot-Time "04:00";
		Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
	CONF
	systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
	say "security updates applied nightly; reboots at 04:00 when a kernel needs one"
	say "the containers restart by themselves after a reboot (restart: unless-stopped)"
fi

step "fail2ban (optional, bans repeat SSH offenders)"
if dpkg -s fail2ban >/dev/null 2>&1; then
	say "already done"
elif [ -n "$shared" ]; then
	say "not installed, and not installed here on a shared machine"
elif [ "${SKIP_FAIL2BAN:-}" = "1" ]; then
	say "skipped — SKIP_FAIL2BAN=1"
else
	apt-get install -y -qq --no-install-recommends fail2ban >/dev/null
	systemctl enable --now fail2ban >/dev/null 2>&1 || true
	say "installed — with key-only SSH this is a belt beside the braces"
fi

step "Docker"
# The apt repository, not the get.docker.com convenience script: this way Docker
# is upgraded by the same unattended-upgrades that patches everything else,
# rather than staying at whatever version the day of installation happened to be.
if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
	say "already done — $(docker --version | cut -d, -f1)"
elif [ -n "$shared" ]; then
	say "Docker with the compose plugin is not here, and a shared machine does not get"
	say "it installed from this script. Install it (https://docs.docker.com/engine/install/ubuntu/)"
	say "and run this again."
	exit 69
else
	install -m 0755 -d "$sys/etc/apt/keyrings" "$sys/etc/apt/sources.list.d"
	curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
		-o "$sys/etc/apt/keyrings/docker.asc"
	chmod a+r "$sys/etc/apt/keyrings/docker.asc"
	printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' \
		"$(dpkg --print-architecture)" "$VERSION_CODENAME" \
		>"$sys/etc/apt/sources.list.d/docker.list"
	apt-get update -qq
	apt-get install -y -qq \
		docker-ce docker-ce-cli containerd.io \
		docker-buildx-plugin docker-compose-plugin >/dev/null
	systemctl enable --now docker >/dev/null
	say "installed — $(docker --version | cut -d, -f1)"
fi
if id -nG deploy | tr ' ' '\n' | grep -qx docker; then
	say "deploy is already in the docker group"
else
	usermod -aG docker deploy
	say "deploy added to the docker group (which is root-equivalent — see above)"
fi

step "the application's folders"
# `current` is deliberately NOT created here. It is a symlink that each release
# repoints at releases/<sha>; if it existed as a directory, the release would
# quietly create a link *inside* it and the running version would never change.
install -d -m 755 -o deploy -g deploy "$dir" "$dir/releases"
# 755, not 700: the app container runs as its own unprivileged user and lists
# this folder (read-only) to warn when the newest dump is too old. Listing
# shows names and ages only — every dump inside is written mode 600, readable
# by deploy alone.
install -d -m 755 -o deploy -g deploy "$backups"
if [ ! -e "$dir/backups" ]; then
	ln -s "$backups" "$dir/backups"
	chown -h deploy:deploy "$dir/backups"
fi
say "$dir/releases for the code, $backups for the nightly database dumps"

step "the settings file"
env_file=$dir/.env
# Two kinds of fact, two homes. This file holds secrets and what only this
# server knows — its short name, its backup folder — and is written once. The
# facts about the app (the name people see, its time zone and locale) are not
# here: deploy/release.mjs reads them from inhouse.config.json and hands them to
# the containers on every release, so the server always says what the
# repository says and there is no second copy to drift.
if [ -f "$env_file" ]; then
	say "already done — $env_file kept; no existing line is changed"
	say "(re-running never rewrites it: that would change the database password"
	say " out from under the database and lock the app out of its own data)"
	# Lines added by later versions of this script, appended only when absent.
	# Neither is a secret, and a release refuses to start without them.
	bind_line=
	[ "$edge" = host ] && bind_line="APP_BIND_PORT=$port"
	for line in "APP_SLUG=$app" "BACKUP_HOST_DIR=$backups" $bind_line; do
		if ! grep -q "^${line%%=*}=" "$env_file"; then
			printf '%s\n' "$line" >>"$env_file"
			say "added the missing line $line"
		fi
	done
else
	# openssl rand, not a hand-picked string: these are never typed by a person
	# and never need to be remembered, so they may as well be unguessable.
	umask 077
	cat >"$env_file" <<-CONF
		# Settings for $app. Written by deploy/server-setup.sh on $(date -u +%Y-%m-%d).
		# Readable only by the deploy user. Never copy this file into Git.

		# This server's short name. It prefixes every container and volume, the
		# database's included, so it must never change once there is data.
		APP_SLUG=$app
		APP_DOMAIN=$domain
		APP_URL=https://$domain
		BETTER_AUTH_URL=https://$domain
		# Where the nightly dumps go. The app reads it (read-only) to warn when
		# the newest dump is more than a day and a half old.
		BACKUP_HOST_DIR=$backups
		$([ "$edge" = host ] && printf '%s\n%s\n' "# The machine's own web server proxies to the app at this port on 127.0.0.1." "APP_BIND_PORT=$port")

		# The app's name, time zone and locale are deliberately not here: every
		# release copies them from inhouse.config.json in the repository.

		# Machine-generated. POSTGRES_PASSWORD is the database's own password: once
		# the database exists, changing this line alone locks the app out of it.
		POSTGRES_PASSWORD=$(openssl rand -hex 24)
		BETTER_AUTH_SECRET=$(openssl rand -hex 32)

		# --- two lines for you to fill in ------------------------------------
		# The app sends e-mail (sign-in links, invitations, notifications) through
		# Resend. Sign up at resend.com, add this domain, then API Keys -> Create.
		# Paste the key that starts with re_ after the = below, and put the address
		# the e-mails should come from after EMAIL_FROM. Until both are set the app
		# runs normally and writes the e-mails to its log instead of sending them.
		RESEND_API_KEY=
		EMAIL_FROM=
	CONF
	chown deploy:deploy "$env_file"
	chmod 600 "$env_file"
	umask 022
	say "wrote $env_file with a fresh database password and session secret"
fi

step "the nightly backup"
# This script arrives over SSH on its own — the repository is not on the machine
# yet — so it cannot copy deploy/backup.sh in, and a copy would drift from Git
# anyway. What goes in /usr/local/bin is four lines that hand over to the copy
# inside whichever release is live, so every deploy updates the backup script
# for free and nothing on the server needs root again after today.
install -d -m 755 "$sys/usr/local/bin" "$sys/etc/systemd/system"
cat >"$sys/usr/local/bin/$app-backup" <<-WRAPPER
	#!/bin/bash
	# Written by deploy/server-setup.sh. The backup itself is deploy/backup.sh
	# inside the running release; this only points at it.
	target=$dir/current/deploy/backup.sh
	if [ ! -f "\$target" ]; then
	  echo '{"event":"backup_skipped","reason":"no release deployed yet"}'
	  exit 0
	fi
	export APP_DIR=$dir
	exec bash "\$target" $app
WRAPPER
chmod 755 "$sys/usr/local/bin/$app-backup"
say "/usr/local/bin/$app-backup runs the copy inside the live release"

# Written here from deploy/systemd/app-backup.service and .timer, kept in step
# with them by hand and overwritten from the release on every deploy.
cat >"$sys/etc/systemd/system/$app-backup.service" <<-UNIT
	[Unit]
	Description=Nightly database dump for $app
	Documentation=https://github.com/brocoders/inhouse-ai-starter-kit
	After=docker.service
	Requires=docker.service

	[Service]
	Type=oneshot
	User=deploy
	Group=deploy
	Environment=APP_NAME=$app
	Environment=APP_DIR=$dir
	ExecStart=/usr/local/bin/$app-backup
	# A dump that hangs must not still be running when tomorrow's starts.
	TimeoutStartSec=30min
	Nice=10
	IOSchedulingClass=idle
UNIT
cat >"$sys/etc/systemd/system/$app-backup.timer" <<-UNIT
	[Unit]
	Description=Run the $app database dump every night

	[Timer]
	OnCalendar=*-*-* 03:15:00
	# If the machine was off at 03:15, run as soon as it is on again. Without
	# this, a server that reboots nightly can go weeks without a backup.
	Persistent=true
	RandomizedDelaySec=5min

	[Install]
	WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now "$app"-backup.timer >/dev/null
say "a dump of the database every night at 03:15, kept for 14 days"
say "next run: $(systemctl show -p NextElapseUSecRealtime --value "$app"-backup.timer)"

step "done"
cat <<-SUMMARY

	  The machine is ready. It is not running your app yet — nothing has been
	  built or started, because the code has not been sent here.

	  Two things left, in this order:

	  1. Open $env_file and fill in the two e-mail lines:
	       ssh deploy@$domain 'nano $dir/.env'
	     (Skip this if you do not need e-mail yet. Sign-in links will not work
	     until you do.)

	  2. Check that $domain points at this machine, then release:
	       pnpm release <the 40-character commit id>
	     The first one takes a few minutes: it builds the image, and Caddy asks
	     Let's Encrypt for the certificate while it starts.

	  If https://$domain shows a certificate error for more than two minutes,
	  the domain's A record is the thing to check first.

SUMMARY
if [ "$edge" = host ]; then
	cat <<-EDGE
	  Before the first release, because this machine's own web server fronts the
	  app: make sure inhouse.config.json says "edge": "host" under deploy, and
	  add this to that web server. For Caddy, in its Caddyfile:

	      $domain {
	          reverse_proxy 127.0.0.1:$port
	      }

	  For nginx, the equivalent server block with proxy_pass http://127.0.0.1:$port
	  and the certificate it already manages. A proxy that itself runs in Docker
	  reaches the app at the host's bridge address (172.17.0.1 by default)
	  instead of 127.0.0.1. Reload it, then release.

	EDGE
fi
