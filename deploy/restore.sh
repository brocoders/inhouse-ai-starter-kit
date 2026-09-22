#!/bin/bash
# Put a backup back. Run on the server, as the deploy user.
#
#   bash restore.sh <app> <dump file>                 -> into a database called app_check
#   bash restore.sh <app> <dump file> --into app_x    -> into a database you name
#   bash restore.sh <app> <dump file> --into-live     -> over the live database
#   bash restore.sh <app> --list                      -> which dumps exist
#
# By default it restores into a *separate* database and leaves the running one
# untouched. That is the common case by a wide margin: you want to look at
# yesterday's data, or prove that the backups are real, not replace today's.
#
# --into-live is the rare one, for a machine being rebuilt or a mistake being
# undone. It stops the app, takes a dump of what is there now (so the "undo the
# undo" exists), and asks you to type the application's name before it does
# anything. That prompt is not ceremony: the difference between the two commands
# is nine characters, and one of them cannot be taken back.
set -euo pipefail

usage() {
	sed -n '3,9p' "$0" | sed 's/^# \{0,1\}//' >&2
	exit 64
}
[ $# -ge 2 ] || usage
app=$1
dump=$2
target=
into_live=
shift 2
while [ $# -gt 0 ]; do
	case $1 in
	--into)
		target=${2:-}
		shift 2
		;;
	--into-live)
		into_live=1
		shift
		;;
	*)
		echo "unknown option: $1" >&2
		exit 64
		;;
	esac
done

dir=/opt/$app
out=/var/backups/$app

if [ "$dump" = "--list" ]; then
	echo "Dumps in $out, newest last:"
	ls -lh "$out"/app-*.dump 2>/dev/null | awk '{printf "  %s  %s %s %s  %s\n", $5, $6, $7, $8, $9}' ||
		echo "  (none yet)"
	exit 0
fi

[ -f "$dump" ] || {
	echo "no such dump: $dump   (try: bash restore.sh $app --list)" >&2
	exit 66
}

compose() {
	local args=(-f "$dir/current/compose.yaml" --project-directory "$dir" --env-file "$dir/.env")
	if [ -f "$dir/.release.env" ]; then
		args+=(--env-file "$dir/.release.env")
	fi
	docker compose "${args[@]}" "$@"
}
psql_app() { compose exec -T db psql -U app -d postgres -v ON_ERROR_STOP=1 "$@"; }

if [ -n "$into_live" ]; then
	target=app
	cat >&2 <<-WARNING

		  About to replace the LIVE database of "$app" with
		    $dump
		  Everything recorded since that dump was taken will be gone.

		  The app will be stopped first and a dump of the current data written to
		  $out, so this is undoable — but only if that dump succeeds.

	WARNING
	printf 'Type the application name (%s) to continue: ' "$app" >&2
	# Read from the terminal, not stdin: this script is sometimes fed a here-doc
	# over SSH, and a confirmation that can be piped in is not a confirmation.
	read -r typed </dev/tty
	[ "$typed" = "$app" ] || {
		echo "that is not '$app' — nothing was changed" >&2
		exit 77
	}
else
	target=${target:-app_check}
	[ "$target" != app ] || {
		echo "refusing: --into app is the live database; use --into-live if you mean it" >&2
		exit 64
	}
fi

[[ $target =~ ^[a-z][a-z0-9_]{0,40}$ ]] || {
	echo "refusing: '$target' is not a plain lowercase database name" >&2
	exit 64
}

if [ -n "$into_live" ]; then
	echo "==> taking a dump of the current live data first"
	bash "$(dirname "$0")/backup.sh" "$app"
	echo "==> stopping the app so nothing writes during the restore"
	compose stop app
fi

echo "==> creating the database $target"
psql_app -c "DROP DATABASE IF EXISTS $target;"
psql_app -c "CREATE DATABASE $target OWNER app;"

echo "==> restoring $(basename "$dump") into $target"
# --clean --if-exists so a re-run into an existing database works too;
# --no-owner because the dump's owner and this cluster's roles need not match.
# pg_restore reports "already exists" style notices as errors even on a clean
# run, so its exit status is shown rather than trusted.
set +e
compose exec -T db pg_restore --no-owner --clean --if-exists -U app -d "$target" <"$dump"
status=$?
set -e
if [ $status -ne 0 ]; then
	echo "pg_restore exited $status — read the lines above before trusting this copy" >&2
fi

tables=$(compose exec -T db psql -U app -d "$target" -tAc \
	"select count(*) from information_schema.tables where table_schema='public'")
echo "==> $target now holds $tables tables"

if [ -n "$into_live" ]; then
	echo "==> starting the app again"
	compose start app
	echo
	echo "Done. Open the app and check one record you recognise before you walk away."
else
	cat <<-NEXT

		  Done. The live database was not touched.

		  To look inside:
		    docker compose -f $dir/current/compose.yaml --project-directory $dir \\
		      --env-file $dir/.env exec db psql -U app -d $target

		  To throw it away when you are finished:
		    ... exec db psql -U app -d postgres -c 'DROP DATABASE $target;'

	NEXT
fi
