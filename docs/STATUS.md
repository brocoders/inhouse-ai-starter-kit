# Current state

Rewrite this section in place; do not append beside it. Everything under
"Recent entries" is an append-only record; `node scripts/archive-status.mjs
--keep 10` moves older entries to `docs/status-archive/`.

## Deployed release

None. The kit has never been released to a server; `deploy/` is tested
against stubbed `ssh` and `docker` only.

## In progress

Version 0.2 is on `main` and on GitHub, tagged `v0.2.0`, with CI, the
test job against real PostgreSQL and the guides publish all green on the
merge commit (21 October 2026). It fixes what
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
- Pushing from an agent session works only with the sandbox off for that
  one command, because the token lives in `~/.config/inhouse/`, which the
  sandbox hides; the same token cannot close or comment on pull requests.
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

## 21 October 2026 — dependencies brought up to date from Dependabot

The three open Dependabot pull requests (#7, #5 and #2) were applied as one
reviewed change rather than merged one by one. Twenty-four packages moved a
minor or patch step. The one that matters is Better Auth, pinned exactly,
from 1.7.5 to 1.7.10: 1.7.7 closed a magic-link account takeover, and every
app on this kit signs people in by magic link. No database migration was
needed and the sign-in rate-limit tests still pass. `cn` 0.3 → 0.5 only
raises its Node floor to 22. GitHub's `setup-node` action moved to 7.1.0.
TypeScript moved from 5.9 to 7.0.2, the native compiler, because the full
check passed with the one configuration change its release notes require
(the frontend `tsconfig` no longer sets `baseUrl`); the typecheck now takes
about a second instead of tens of seconds. Held back: `@types/node` stays
on 24 although 26 is published, because the image and `.nvmrc` stay on Node
24 until 26 has run on a real project. Tested: `pnpm check` green before
and after the TypeScript step, 164 KB on first paint. Nothing deployed; the
kit has no server. `docs/stack.md` is re-verified as of today. On GitHub:
CI, Docs and Tests all green on merge commit 07e005c, and Dependabot
closed its three pull requests itself once `main` carried the versions.
