# Current state

Rewrite this section in place; do not append beside it. Everything under
"Recent entries" is an append-only record; `node scripts/archive-status.mjs
--keep 10` moves older entries to `docs/status-archive/`.

## Deployed release

None. The kit has never been released to a server; `deploy/` is tested
against stubbed `ssh` and `docker` only.

## In progress

Version 0.2 is built on `main`, not yet pushed or tagged. It fixes what
stopped the first release and the first agent session of the three projects
that used version 0.1 (`docs/reviews/2026-10-21-feedback-review.md`): the
production image now carries PGlite and the seed script, a blank `.env`
line means "not set", the theme script is a file the security policy
allows, `pnpm db:copy` finds the release layout, a deleted job's schedule
row is forgotten, the worked example's conflict check is written correctly,
the app's name, zone and locale reach development from `inhouse.config.json`,
the release skill describes the script as it is, and the sandbox, guard and
write hook let a session use `node --run`, its scratch folder and its memory.
Version 0.3 is the list of mechanisms every app needed and built itself:
a server that already hosts something, off-site backups, an outbox that
reaches the owner, interval jobs, a "More" tab.

## Known problems

- The kit's own `deploy/` has run on one real server only through the first
  app built on it (about twenty-five releases, scripts unchanged), never
  from this repository; `server-setup.sh` has still not run whole anywhere.
- Hooks were exercised by hand with sample payloads and by their tests, not
  inside a live Claude Code session; the scratch-folder and memory-folder
  allowances in 0.2 are tested the same way.
- Pushing from this machine needs the owner to run `git push origin main`:
  Claude Code's auto-mode classifier refuses a push from an agent session.
- The three projects' later friction (CI on a private repo, the first-screen
  budget, a tab bar of eight screens, every-N-minutes jobs) is reviewed but
  not fixed; see version 0.3 in the review.

# Recent entries

## 23 September 2026 — first push, first green CI

The first Tests run failed: CI sets `TEST_DATABASE_URL` for the whole run
and the config applied it to every test process, so two files at a time
migrated the same real database and collided. Only the Postgres test file
opts in now; every other file keeps its in-memory PGlite. Second run green.
A path-filtered workflow does not run on the very first push of a repository
(there is no diff to filter); a Dependabot pull request triggered it instead.

## 21 October 2026 — the review after three projects, and version 0.2

Three projects used version 0.1 in four weeks: one built on it and released
about twenty-five times, one copied its admin panel into a Next.js site, and
the project the kit grew out of moved on past it. Their records were read
and ranked (`docs/reviews/2026-10-21-feedback-review.md`). Twelve defects
were verified in the kit's code; nine stopped a real release or a real
session. Version 0.2 fixes those and the small rules the projects learned,
and adds `docs/kit-feedback.md` with the `release` skill asking for a line
at the end of every release, because the one project that kept such a file
wrote thirty-three lines on its first day and none afterwards. `pnpm check`
green; nothing released, since the kit itself has no server.
