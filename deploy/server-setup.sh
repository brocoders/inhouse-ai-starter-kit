#!/bin/bash
# Turn a brand-new Ubuntu 24.04 machine into one that can run this application.
# Run it once, as root, from your own laptop:
#
#   ssh root@<the server's IP address> 'bash -s' <app name> <domain> \
#     < deploy/server-setup.sh
#
# for example
#
#   ssh root@203.0.113.10 'bash -s' orders orders.example.com \
#     < deploy/server-setup.sh
#
# It is safe to run again. Every step checks whether it has already been done
# and says "already done" instead of doing it twice; nothing here ever touches
# the database or its backups. If it stops halfway, fix what it complained about
# and run the same line again.
#
# What it does NOT do: fetch the application, build it or start it. That is
# `pnpm release <sha>`, and the summary at the end tells you so.
set -euo pipefail

app=${1:-}
domain=${2:-}
if [[ ! $app =~ ^[a-z][a-z0-9-]{1,30}$ ]] || [ -z "$domain" ]; then
	echo "usage: ssh root@IP 'bash -s' <app-name> <domain> < deploy/server-setup.sh" >&2
	echo "  app-name: lowercase letters, digits and dashes, e.g. orders" >&2
	echo "  domain:   the name people will type, e.g. orders.example.com" >&2
	exit 64
fi
[ "$(id -u)" -eq 0 ] || {
	echo "run this as root; it installs packages and system services" >&2
	exit 77
}

dir=/opt/$app
backups=/var/backups/$app
say() { printf '     %s\n' "$*"; }
step() { printf '\n[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

step "checking the machine"
. /etc/os-release
if [ "${VERSION_ID:-}" != "24.04" ]; then
	say "WARNING: this is ${PRETTY_NAME:-an unknown system}, not Ubuntu 24.04."
	say "It may work. Nothing below has been tried on it."
else
	say "Ubuntu 24.04 — as expected"
fi
say "app name '$app', domain '$domain'"

step "installing the basics"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
# --no-install-recommends keeps this to what is named and nothing suggested.
apt-get install -y -qq --no-install-recommends \
	ca-certificates curl gnupg openssl ufw unattended-upgrades \
	apt-listchanges postgresql-client-16 >/dev/null
say "ca-certificates curl gnupg openssl ufw unattended-upgrades psql — present"

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
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
if [ -s /root/.ssh/authorized_keys ]; then
	# The key you are logged in with right now. Copied rather than generated, so
	# there is no new secret to move around and nothing to lose.
	install -m 600 -o deploy -g deploy /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
	say "your SSH key copied to deploy ($(wc -l </root/.ssh/authorized_keys) key(s))"
else
	say "WARNING: root has no authorized_keys, so deploy has no key either."
	say "Add yours to /home/deploy/.ssh/authorized_keys before locking SSH down."
fi

step "locking down SSH"
# A separate file under sshd_config.d rather than an edit to sshd_config: an
# Ubuntu upgrade replaces the main file and would silently undo an edit there.
hardening=/etc/ssh/sshd_config.d/99-hardening.conf
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
if ufw status | grep -q '^Status: active'; then
	say "already done — active"
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
say "note: published container ports bypass ufw — only Caddy publishes any"

step "automatic security updates"
auto=/etc/apt/apt.conf.d/51-inhouse-unattended
if [ -f "$auto" ]; then
	say "already done"
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
else
	install -m 0755 -d /etc/apt/keyrings
	curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
		-o /etc/apt/keyrings/docker.asc
	chmod a+r /etc/apt/keyrings/docker.asc
	printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' \
		"$(dpkg --print-architecture)" "$VERSION_CODENAME" \
		>/etc/apt/sources.list.d/docker.list
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
install -d -m 700 -o deploy -g deploy "$backups"
if [ ! -e "$dir/backups" ]; then
	ln -s "$backups" "$dir/backups"
	chown -h deploy:deploy "$dir/backups"
fi
say "$dir/releases for the code, $backups for the nightly database dumps"

step "the settings file"
env_file=$dir/.env
if [ -f "$env_file" ]; then
	say "already done — $env_file left exactly as it is"
	say "(re-running never rewrites it: that would change the database password"
	say " out from under the database and lock the app out of its own data)"
else
	# openssl rand, not a hand-picked string: these are never typed by a person
	# and never need to be remembered, so they may as well be unguessable.
	umask 077
	cat >"$env_file" <<-CONF
		# Settings for $app. Written by deploy/server-setup.sh on $(date -u +%Y-%m-%d).
		# Readable only by the deploy user. Never copy this file into Git.

		APP_NAME=$app
		APP_DOMAIN=$domain
		APP_URL=https://$domain
		BETTER_AUTH_URL=https://$domain

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
# yet — so it cannot copy deploy/backup.sh in. It installs a placeholder that
# exits cleanly, and every release copies the real deploy/backup.sh and the two
# unit templates from deploy/systemd/ over it. One copy of the truth, in Git.
if [ -x /usr/local/bin/"$app"-backup ] &&
	! head -3 /usr/local/bin/"$app"-backup | grep -q 'Placeholder written by'; then
	say "already done — the real backup script is installed"
else
	cat >/usr/local/bin/"$app"-backup <<-'PLACEHOLDER'
		#!/bin/bash
		# Placeholder written by server-setup.sh before any release existed.
		# The first `pnpm release` replaces this with deploy/backup.sh.
		echo "no release has been deployed yet; nothing to back up" >&2
		exit 0
	PLACEHOLDER
	chmod 755 /usr/local/bin/"$app"-backup
	say "placeholder installed; the first release replaces it with the real one"
fi

# Written here from deploy/systemd/app-backup.service and .timer, kept in step
# with them by hand and overwritten from the release on every deploy.
cat >/etc/systemd/system/"$app"-backup.service <<-UNIT
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
	ExecStart=/usr/local/bin/$app-backup
	# A dump that hangs must not still be running when tomorrow's starts.
	TimeoutStartSec=30min
	Nice=10
	IOSchedulingClass=idle
UNIT
cat >/etc/systemd/system/"$app"-backup.timer <<-UNIT
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
	       ssh deploy@$domain 'nano /opt/$app/.env'
	     (Skip this if you do not need e-mail yet. Sign-in links will not work
	     until you do.)

	  2. Check that $domain points at this machine, then release:
	       pnpm release <the 40-character commit id>
	     The first one takes a few minutes: it builds the image, and Caddy asks
	     Let's Encrypt for the certificate while it starts.

	  If https://$domain shows a certificate error for more than two minutes,
	  the domain's A record is the thing to check first.

SUMMARY
