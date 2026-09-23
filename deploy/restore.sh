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

# inhouse.config.json names this folder (deploy.dir); it is /opt/<app> unless
# the creator chose otherwise, and APP_DIR is how the caller says so.
dir=${APP_DIR:-/opt/$app}
# Where the dumps go. Overridable for the same reason as APP_DIR, and so that
# this script can be exercised somewhere other than a real server.
out=${BACKUP_DIR:-/var/backups/$app}

if [ "$dump" = "--list" ]; then
	# app-<date>T<time>Z.dump is a nightly or pre-release dump;
	# pre-restore-app-... is the copy this script took before a restore.
	echo "Dumps in $out, oldest first:"
	shopt -s nullglob
	dumps=("$out"/app-*.dump "$out"/pre-restore-app-*.dump)
	if [ ${#dumps[@]} -eq 0 ]; then
		echo "  (none yet)"
		exit 0
	fi
	ls -lhtr "${dumps[@]}" | awk '{printf "  %6s  %s %s %s  %s\n", $5, $6, $7, $8, $9}'
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
# </dev/null: `compose exec` forwards stdin even with -T, and this script is
# sometimes fed to bash over SSH, where stdin is the rest of the script.
psql_app() { compose exec -T db psql -U app -d postgres -v ON_ERROR_STOP=1 "$@" </dev/null; }

# Before anything else — before the prompt, the safety copy, stopping the app or
# dropping a database — make sure the file is a dump pg_restore can read. A
# truncated copy or the wrong file is refused here, while nothing has changed.
echo "==> checking that $(basename "$dump") is a readable dump"
if ! compose exec -T db pg_restore --list <"$dump" >/dev/null; then
	echo "refusing: pg_restore cannot read $dump — nothing was changed" >&2
	exit 65
fi
# Held open from here on. The safety copy below prunes dumps older than
# fourteen days, and this one may be among them; an open file survives that.
exec 3<"$dump"

if [ -n "$into_live" ]; then
	target=app
	cat >&2 <<-WARNING

		  About to replace the LIVE database of "$app" with
		    $dump
		  Everything recorded since that dump was taken will be gone.

		  The app will be stopped first and a dump of the current data written to
		  $out/pre-restore-app-<time>.dump, so this is undoable — but only
		  if that dump succeeds, and nothing happens if it does not.

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

safety=
if [ -n "$into_live" ]; then
	echo "==> taking a dump of the current live data first"
	# Named pre-restore-app-<time>.dump, so it can never be the file being
	# restored. Under set -e a failed safety copy stops everything here.
	result=$(bash "$(dirname "$0")/backup.sh" "$app" --pre-restore)
	echo "$result"
	safety=$(printf '%s\n' "$result" | sed -n 's/.*"file":"\([^"]*\)".*/\1/p' | tail -1)
	[ -n "$safety" ] || {
		echo "refusing: the safety copy did not report a file — nothing was changed" >&2
		exit 75
	}
	echo "==> stopping the app so nothing writes during the restore"
	compose stop app
fi

echo "==> creating the database $target"
psql_app -c "DROP DATABASE IF EXISTS $target;"
psql_app -c "CREATE DATABASE $target OWNER app;"

echo "==> restoring $(basename "$dump") into $target"
# --no-owner because the dump's owner and this cluster's roles need not match.
# The database was created empty a moment ago, so a sound dump restores without
# a single error and any error means this copy cannot be trusted.
if ! compose exec -T db pg_restore --no-owner -U app -d "$target" <&3; then
	echo >&2
	echo "pg_restore failed — the errors are above. $target is incomplete." >&2
	if [ -n "$into_live" ]; then
		cat >&2 <<-FAILED
			The app is still stopped, deliberately: starting it on a half-restored
			database would let it write into that. To put back what was there before:

			  bash $0 $app $safety --into-live

		FAILED
	fi
	exit 70
fi

tables=$(compose exec -T db psql -U app -d "$target" -tAc \
	"select count(*) from information_schema.tables where table_schema='public'" </dev/null)
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
