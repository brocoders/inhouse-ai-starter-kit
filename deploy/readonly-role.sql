-- A database login that can look but not touch.
--
-- Applied by deploy/db-readonly.sh, which generates the password and passes it
-- in as :readonly_password. Run it again whenever new tables appear.
--
-- Why it exists: now and then a question can only be answered against the live
-- data — "how many of these are still open right now?" — and the alternative is
-- connecting as the application's own user, which can also drop the table the
-- question is about. Three settings make that impossible rather than unlikely.

\set ON_ERROR_STOP on

-- Created only if absent; running this file twice must not fail.
SELECT format('CREATE ROLE readonly LOGIN PASSWORD %L', :'readonly_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'readonly')
\gexec

ALTER ROLE readonly WITH LOGIN PASSWORD :'readonly_password';

-- 1. Every transaction this role opens is read-only at the server, so a stray
--    UPDATE is refused by PostgreSQL rather than by our good intentions.
ALTER ROLE readonly SET default_transaction_read_only = on;

-- 2. Thirty seconds and the query is cancelled. A mistyped join across two big
--    tables is the ordinary way a live investigation becomes an outage.
ALTER ROLE readonly SET statement_timeout = '30s';

-- 3. No idle transaction left holding a snapshot, which blocks VACUUM and
--    quietly bloats the tables while someone forgets a psql window is open.
ALTER ROLE readonly SET idle_in_transaction_session_timeout = '60s';

GRANT CONNECT ON DATABASE app TO readonly;
GRANT USAGE ON SCHEMA public TO readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO readonly;

-- Tables that do not exist yet. Without this line a migration adds a table and
-- the read-only login cannot see it, which looks like missing data.
ALTER DEFAULT PRIVILEGES FOR ROLE app IN SCHEMA public GRANT SELECT ON TABLES TO readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE app IN SCHEMA public GRANT SELECT ON SEQUENCES TO readonly;

-- The role must not be able to create anything of its own either.
REVOKE CREATE ON SCHEMA public FROM readonly;
