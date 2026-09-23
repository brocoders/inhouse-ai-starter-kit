# Current state

Rewrite this section in place; do not append beside it. Everything under
"Recent entries" is an append-only record; `node scripts/archive-status.mjs
--keep 10` moves older entries to `docs/status-archive/`.

## Deployed release

None. The kit has never been released to a server; `deploy/` is tested
against stubbed `ssh` and `docker` only.

## In progress

Version 0.1 of the kit is on `main` (23 September 2026): server, screens,
design system, agent tooling, deployment path and the guides site, all merged
and passing `pnpm check`. Next: the first real release onto a rented server,
then the owner's pilot project on top of the kit.

## Known problems

- Unverified without Docker: the image build, Compose bring-up, `flock` on
  the server, `pg_restore` into a fresh database, the container reading the
  bind-mounted backup folder. Listed in `docs/server-requirements.md`.
- Hooks were exercised by hand with sample payloads, not inside a live
  Claude Code session.
- The Postgres-only test has never run; CI will be the first to execute it.

# Recent entries
