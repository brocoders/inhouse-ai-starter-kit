# Current state

Rewrite this section in place; do not append beside it. Everything under
"Recent entries" is an append-only record; `node scripts/archive-status.mjs
--keep 10` moves older entries to `docs/status-archive/`.

## Deployed release

None. The kit has never been released to a server; `deploy/` is tested
against stubbed `ssh` and `docker` only.

## In progress

Version 0.1 of the kit is on `main` and on GitHub
(`brocoders/inhouse-ai-starter-kit`, public, template) since 23 September 2026. CI is green on `main`: 146 tests including the one against a real
PostgreSQL, the design checker and the bundle budget. The guides are
published at https://brocoders.github.io/inhouse-ai-starter-kit/.
Dependabot's first update (`actions/cache` 6.1) is merged. Next: the first
real release onto a rented server, then the owner's pilot project.

## Known problems

- Unverified without Docker: the image build, Compose bring-up, `flock` on
  the server, `pg_restore` into a fresh database, the container reading the
  bind-mounted backup folder. Listed in `docs/server-requirements.md`.
- Hooks were exercised by hand with sample payloads, not inside a live
  Claude Code session.
- Pushing from this machine needs the owner to run `git push origin main`:
  Claude Code's auto-mode classifier refuses a push from an agent session.

# Recent entries

## 23 September 2026 — first push, first green CI

The first Tests run failed: CI sets `TEST_DATABASE_URL` for the whole run
and the config applied it to every test process, so two files at a time
migrated the same real database and collided. Only the Postgres test file
opts in now; every other file keeps its in-memory PGlite. Second run green.
A path-filtered workflow does not run on the very first push of a repository
(there is no diff to filter); a Dependabot pull request triggered it instead.
