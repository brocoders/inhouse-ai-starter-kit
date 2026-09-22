#!/bin/bash
# Run this repository's automated checks on this server instead of on GitHub's
# machines. Run once, on the server, as root:
#
#   ssh root@<server> 'bash -s' <owner/repo> <token> < deploy/runner-setup.sh
#
# Where to get the token, and the catch: GitHub -> your repository -> Settings
# -> Actions -> Runners -> New self-hosted runner. The page shows a token that
# starts with A and expires ONE HOUR after it is shown. Copy it and run this
# straight away; if it has expired the registration fails with "Invalid
# configuration provided for token" and you simply reload that page for a new one.
#
# Why bother: GitHub gives a private repository 2,000 free minutes a month, and
# a project under daily development can burn those in the first week. This
# machine is already paid for and idle most of the time.
#
# Private repositories only. A self-hosted runner on a public repository will
# execute code from anyone's pull request on this machine, which is the same as
# handing out a root shell.
set -euo pipefail

repo=${1:-}
token=${2:-}
if [[ ! $repo =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]] || [ -z "$token" ]; then
	echo "usage: ssh root@server 'bash -s' <owner/repo> <registration token> < deploy/runner-setup.sh" >&2
	exit 64
fi
[ "$(id -u)" -eq 0 ] || {
	echo "run this as root" >&2
	exit 77
}

say() { printf '     %s\n' "$*"; }
step() { printf '\n[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

home=/opt/actions-runner
step "checking"
id -u deploy >/dev/null 2>&1 || {
	echo "no 'deploy' user; run deploy/server-setup.sh first" >&2
	exit 69
}
if [ -f "$home/.runner" ]; then
	say "a runner is already registered here."
	say "To point it at a different repository, remove it first:"
	say "  cd $home && sudo -u deploy ./config.sh remove --token <a fresh token>"
	exit 0
fi
say "no runner registered yet"

step "downloading the runner"
install -d -o deploy -g deploy "$home"
# The version is read from GitHub rather than pinned here: a runner more than a
# few weeks behind is refused by the service, so a pinned version in this file
# would become a scheduled failure.
version=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest |
	grep -m1 '"tag_name"' | sed 's/.*"v\([^"]*\)".*/\1/')
[ -n "$version" ] || {
	echo "could not read the latest runner version from GitHub" >&2
	exit 69
}
case "$(dpkg --print-architecture)" in
amd64) arch=x64 ;;
arm64) arch=arm64 ;;
*)
	echo "unsupported architecture $(dpkg --print-architecture)" >&2
	exit 69
	;;
esac
url=https://github.com/actions/runner/releases/download/v$version/actions-runner-linux-$arch-$version.tar.gz
curl -fsSL "$url" | tar -xz -C "$home"
chown -R deploy:deploy "$home"
say "actions-runner $version ($arch) unpacked into $home"

step "installing the runner's own dependencies"
"$home/bin/installdependencies.sh" >/dev/null
say "done"

step "registering with $repo"
# --ephemeral: the runner takes exactly one job and then unregisters itself, and
# the service starts a fresh one. A long-lived runner keeps whatever the last
# job left behind — files, environment, a half-installed dependency — and the
# next job inherits it, which is how a green build becomes unreproducible.
sudo -u deploy "$home/config.sh" \
	--unattended \
	--url "https://github.com/$repo" \
	--token "$token" \
	--name "$(hostname -s)" \
	--labels self-hosted,linux,inhouse \
	--work _work \
	--ephemeral
say "registered as $(hostname -s)"

step "running it as a service"
(cd "$home" && ./svc.sh install deploy >/dev/null && ./svc.sh start >/dev/null)
unit=$(basename "$(ls /etc/systemd/system/actions.runner.*.service | head -1)")
say "$unit is running"

step "keeping it out of the application's way"
# The application and the database share this machine with the runner. Without
# these three lines a test suite that spawns workers can take every core, and
# the app becomes slow for real people while a pull request is being checked.
# CPUQuota=100% means one core's worth, not "all of it".
dropin=/etc/systemd/system/$unit.d
install -d "$dropin"
cat >"$dropin/limits.conf" <<-'CONF'
	# Written by deploy/runner-setup.sh. The app comes first on this machine.
	[Service]
	CPUQuota=100%
	MemoryMax=1G
	Nice=10
	IOSchedulingClass=idle
CONF
systemctl daemon-reload
systemctl restart "$unit"
say "one core, 1 GB, lowest priority"

step "done"
cat <<-SUMMARY

	  The runner is registered and idle. Point a workflow at it by changing

	      runs-on: ubuntu-latest
	  to
	      runs-on: self-hosted

	  in .github/workflows/*.yml, and push. GitHub -> Settings -> Actions ->
	  Runners should show it as "Idle", turning to "Active" while a job runs.

	  If it never turns Active: the label in runs-on has to match one this runner
	  has (self-hosted, linux, inhouse).

	  To remove it later:
	      cd $home && sudo -u deploy ./config.sh remove --token <a fresh token>

SUMMARY
