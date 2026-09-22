#!/bin/bash
# Create (or renew) the look-but-don't-touch database login, and print how to
# use it from a laptop. Run on the server, as the deploy user:
#
#   bash /opt/<app>/current/deploy/db-readonly.sh <app>
#
# Run it again after a release that added tables — new tables are covered
# automatically, but running it costs nothing and proves they are.
#
# The password is printed once, here, and not stored anywhere on the server.
# Put it in your password manager. Losing it costs one re-run of this script.
set -euo pipefail
umask 077

app=${1:-${APP_NAME:-}}
[ -n "$app" ] || {
	echo "usage: bash deploy/db-readonly.sh <app-name>" >&2
	exit 64
}
# inhouse.config.json names this folder (deploy.dir); it is /opt/<app> unless
# the creator chose otherwise, and APP_DIR is how the caller says so.
dir=${APP_DIR:-/opt/$app}
sql=$(dirname "$0")/readonly-role.sql
[ -f "$sql" ] || {
	echo "cannot find readonly-role.sql next to this script" >&2
	exit 66
}

compose() {
	local args=(-f "$dir/current/compose.yaml" --project-directory "$dir" --env-file "$dir/.env")
	if [ -f "$dir/.release.env" ]; then
		args+=(--env-file "$dir/.release.env")
	fi
	docker compose "${args[@]}" "$@"
}

password=$(openssl rand -hex 24)

# -v passes the password as a psql variable so it is quoted by psql's own %L
# rather than pasted into SQL by this script. The file is fed on stdin; nothing
# writes the password to disk on the server.
compose exec -T db psql -U app -d app -q \
	-v ON_ERROR_STOP=1 -v readonly_password="$password" <"$sql"

cat <<-NEXT

	  The 'readonly' login is ready. It can run SELECT and nothing else: every
	  transaction it opens is read-only at the server, queries are cancelled
	  after 30 seconds, and it cannot create anything.

	  The password, which is not stored anywhere — copy it now:

	      $password

	  To use it from your laptop, open a tunnel (a private pipe through SSH to
	  a port that is not on the internet) in one terminal:

	      ssh -N -L 55432:localhost:55432 deploy@$app-server

	  and on the server, expose the database on that port for the session:

	      docker compose -f $dir/current/compose.yaml --project-directory $dir \\
	        --env-file $dir/.env run --rm -p 55432:5432 --entrypoint sleep db 3600

	  Then connect to postgres://readonly:<password>@localhost:55432/app

	  If that feels like a lot of steps: it is, deliberately. The everyday way to
	  look at production data is 'pnpm db:copy', which brings a copy down to your
	  machine. This login is for the question that only the live data can answer.

NEXT
