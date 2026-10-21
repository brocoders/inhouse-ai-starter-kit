#!/bin/bash
# One copy of the database, written to this machine's disk.
#
#   /usr/local/bin/<app>-backup                (what the nightly timer runs)
#   bash deploy/backup.sh <app>                (the same thing, by hand)
#   bash deploy/backup.sh <app> --pre-restore  (restore.sh, before it overwrites)
#
# Each dump is named for the second it was taken, app-2026-09-21T031502Z.dump,
# so two dumps on the same day are two files. They used to be named for the day
# alone, and restoring today's dump over the live database began by taking a
# safety dump — which overwrote the very file about to be restored.
#
# Run every night at 03:15 by <app>-backup.timer, and once more by
# deploy/release.mjs immediately before a release changes anything — so the
# newest dump is always from before the last thing that could have broken.
#
# This is a copy on the same disk as the original. It answers "the migration ate
# a column" and "someone deleted the wrong record"; it does not answer "the
# machine is gone". The provider's snapshot does that, and so does the off-site
# copy below once <folder>/.backup.env exists: the new dump and the server's
# .env go to an S3-compatible bucket through restic, encrypted with the
# password in that file, keeping 14 daily, 8 weekly and 6 monthly copies. The
# file is written by the owner by hand and read by nothing but this script.
# See docs/backups.md.
set -euo pipefail
umask 077

app=${1:-${APP_NAME:-}}
[ -n "$app" ] || {
	echo "usage: bash deploy/backup.sh <app-name> [--pre-restore]" >&2
	exit 64
}
# The safety copy restore.sh takes of the live data before replacing it. A
# different prefix, so it can never be mistaken for, or take the place of, the
# dump being restored.
prefix=
case ${2:-} in
'') ;;
--pre-restore) prefix=pre-restore- ;;
*)
	echo "unknown option: $2" >&2
	exit 64
	;;
esac
# inhouse.config.json names this folder (deploy.dir); it is /opt/<app> unless
# the creator chose otherwise, and APP_DIR is how the caller says so.
dir=${APP_DIR:-/opt/$app}
# Where the dumps go. Overridable for the same reason as APP_DIR, and so that
# this script can be exercised somewhere other than a real server.
out=${BACKUP_DIR:-/var/backups/$app}
keep_days=14

[ -d "$dir" ] || {
	echo "$dir does not exist; run deploy/server-setup.sh first" >&2
	exit 69
}
mkdir -p "$out"

compose() {
	local args=(-f "$dir/current/compose.yaml" --project-directory "$dir" --env-file "$dir/.env")
	# Written by the release; absent before the first one. Tested with `if` and
	# not `&&`, because under `set -e` a failing `&&` list ends the script.
	if [ -f "$dir/.release.env" ]; then
		args+=(--env-file "$dir/.release.env")
	fi
	docker compose "${args[@]}" "$@"
}

if [ ! -e "$dir/current/compose.yaml" ]; then
	# Nothing is deployed, so there is no database to copy. Normal for the timer
	# on a machine that has not had its first release; an error for restore.sh,
	# which promised a safety copy before it replaces anything.
	echo '{"event":"backup_skipped","reason":"no release deployed yet"}'
	if [ -n "$prefix" ]; then exit 69; fi
	exit 0
fi

stamp=$(date -u +%Y-%m-%dT%H%M%SZ)
final=$out/${prefix}app-$stamp.dump
if [ -e "$final" ]; then
	# Two dumps within the same second. Never overwrite one.
	echo "{\"event\":\"backup_failed\",\"reason\":\"$final already exists\"}" >&2
	exit 75
fi
staged=$out/.partial-$$

# Written to a temporary name and renamed only once pg_dump has succeeded. A
# dump interrupted halfway would otherwise sit in the folder looking exactly
# like a good one, and be found out on the day it is needed.
cleanup() { rm -f "$staged"; }
trap cleanup EXIT

# -Fc is PostgreSQL's own compressed format: it restores selectively (one table,
# or the schema without the data) where a plain .sql file has to be run whole.
# </dev/null because `compose exec` forwards stdin even with -T, and when a
# release runs this over SSH, stdin is the rest of the release's script.
compose exec -T db pg_dump -U app -Fc app </dev/null >"$staged"

size=$(wc -c <"$staged" | tr -d " ")
# An empty or near-empty file means pg_dump wrote an error to stdout, or the
# container was not there. 1 KB is below any real schema and far above nothing.
if [ "$size" -lt 1024 ]; then
	echo "{\"event\":\"backup_failed\",\"reason\":\"dump is only $size bytes\"}" >&2
	exit 75
fi

mv "$staged" "$final"
trap - EXIT

# Fourteen days, by the file's own age rather than the date in its name:
# long enough that a problem noticed a fortnight later is still recoverable,
# short enough that the dumps never become the reason the disk fills. The two
# patterns only ever match this app's own dumps.
removed=$(find "$out" -maxdepth 1 -type f \( -name 'app-*.dump' -o -name 'pre-restore-app-*.dump' \) \
	-mtime +"$keep_days" -print -delete | wc -l | tr -d ' ')

# --- off-site ---------------------------------------------------------------
# Only when the owner has set it up. A failure here is written down and does
# not fail the backup: the dump on disk is real and the release that called
# this may go on. The app notices instead — the marker file below goes stale
# and the health page says so, which reaches the owner through health.watch.
off_server=false
offsite_env=$dir/.backup.env
if [ -f "$offsite_env" ]; then
	if ! command -v restic >/dev/null 2>&1; then
		echo '{"event":"backup_offsite_skipped","reason":"restic is not installed"}' >&2
	else
		# The four lines of the file become restic's environment for this
		# process only. Nothing below prints them, and nothing may.
		set -a
		# shellcheck disable=SC1090
		. "$offsite_env"
		set +a
		if [ -z "${RESTIC_REPOSITORY:-}" ] || [ -z "${RESTIC_PASSWORD:-}" ]; then
			echo '{"event":"backup_offsite_skipped","reason":"RESTIC_REPOSITORY or RESTIC_PASSWORD missing in .backup.env"}' >&2
		elif
			# Make the repository on first use; ask quietly whether it exists.
			{ restic cat config >/dev/null 2>&1 || restic init -q >/dev/null; } &&
				restic backup -q --tag "$app" "$final" "$dir/.env" >/dev/null &&
				restic forget -q --tag "$app" --keep-daily 14 --keep-weekly 8 --keep-monthly 6 --prune >/dev/null
		then
			off_server=true
			# When the last copy left: a dot-file, so it is not mistaken for a
			# dump, written whole so a reader never sees half a date.
			printf '%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$out/.offsite-last.partial"
			mv "$out/.offsite-last.partial" "$out/.offsite-last"
		else
			echo '{"event":"backup_offsite_failed","reason":"restic did not finish; see its output above"}' >&2
		fi
	fi
fi

printf '{"event":"backup_completed","file":"%s","bytes":%s,"removed_old":%s,"off_server":%s}\n' \
	"$final" "$size" "$removed" "$off_server"
