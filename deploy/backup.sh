#!/bin/bash
# One copy of the database, written to this machine's disk.
#
#   /usr/local/bin/<app>-backup          (what the nightly timer runs)
#   bash deploy/backup.sh <app>          (the same thing, by hand)
#
# Run every night at 03:15 by <app>-backup.timer, and once more by
# deploy/release.mjs immediately before a release changes anything — so the
# newest dump is always from before the last thing that could have broken.
#
# This is a copy on the same disk as the original. It answers "the migration ate
# a column" and "someone deleted the wrong record"; it does not answer "the
# machine is gone". The provider's snapshot does that. See docs/backups.md.
set -euo pipefail
umask 077

app=${1:-${APP_NAME:-}}
[ -n "$app" ] || {
	echo "usage: bash deploy/backup.sh <app-name>" >&2
	exit 64
}
dir=/opt/$app
out=/var/backups/$app
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
	echo '{"event":"backup_skipped","reason":"no release deployed yet"}'
	exit 0
fi

stamp=$(date -u +%Y-%m-%d)
final=$out/app-$stamp.dump
staged=$out/.partial-$$

# Written to a temporary name and renamed only once pg_dump has succeeded. A
# dump interrupted halfway would otherwise sit in the folder looking exactly
# like a good one, and be found out on the day it is needed.
cleanup() { rm -f "$staged"; }
trap cleanup EXIT

# -Fc is PostgreSQL's own compressed format: it restores selectively (one table,
# or the schema without the data) where a plain .sql file has to be run whole.
compose exec -T db pg_dump -U app -Fc app >"$staged"

size=$(wc -c <"$staged")
# An empty or near-empty file means pg_dump wrote an error to stdout, or the
# container was not there. 1 KB is below any real schema and far above nothing.
if [ "$size" -lt 1024 ]; then
	echo "{\"event\":\"backup_failed\",\"reason\":\"dump is only $size bytes\"}" >&2
	exit 75
fi

mv -f "$staged" "$final"
trap - EXIT

# Fourteen days: long enough that a problem noticed a fortnight later is still
# recoverable, short enough that the dumps never become the reason the disk
# fills. -mtime +$keep_days only ever matches this app's own files.
removed=$(find "$out" -maxdepth 1 -type f -name 'app-*.dump' -mtime +"$keep_days" -print -delete | wc -l)

printf '{"event":"backup_completed","file":"%s","bytes":%s,"removed_old":%s,"off_server":false}\n' \
	"$final" "$size" "$removed"
