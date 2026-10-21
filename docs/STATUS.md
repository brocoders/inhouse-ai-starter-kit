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
Version 0.3 is being built on branch `claude/gracious-brattain-ea8ed9`
from the agreed spec `docs/specs/version-0.3.md`, one commit per step.
Landed so far: (1) the shared-server path — `server-setup.sh --shared`
and `deploy.edge: "host"`; (2) `{ everyMinutes }` schedules; (3) the
phone tab bar with "More"; (4) the phone pass: 44 px targets, confirmations,
one home for the history vocabulary; (5) the notify outbox with owner
alerts; (6) restic off-site backups; (7) the two-part first-paint budget;
(8) CI on a private repository and a no-CI mode. Still to come: a home for
an app's departures from the kit.

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

## 21 October 2026 — version 0.3, step by step

The owner agreed the spec (`docs/specs/version-0.3.md`): nine mechanisms
every app had built for itself, in the order the review ranked them. Each
step is one commit with its tests and its documentation.

1. **A server that already hosts something.** `server-setup.sh --shared`
   takes an explicit folder, reads the machine (SSH, firewall, updates,
   Docker) and writes only this app's files; it refuses a name whose
   database volume already belongs to another folder, and a taken port 80
   or 443. `--edge host` plus `deploy.edge: "host"` leaves the web server
   to the machine: the release lays `compose.host-edge.yaml` over
   `compose.yaml`, the app listens on `127.0.0.1` only, and the kit's Caddy
   is never started. Proven by `scripts/server-setup.test.mjs`, which runs
   the whole script against a scratch folder with the machine's commands
   stubbed — the first time the script has run whole anywhere.
2. **Jobs every so many minutes.** `schedule(name, { everyMinutes: 15 })`
   beside `{ daily: '07:00' }`: lined up one interval ahead when first
   seen, run once when due, the next counted from then, so an hour of
   downtime gives one run, not four. Whole minutes from 1 to 1440. Six new
   tests in `schedules.test.ts`.
3. **The phone tab bar with "More".** Up to five screens are five tabs;
   from six, the first four are tabs and the fifth opens a bottom sheet
   with the rest, lit while one of them is showing. The split is a pure
   function with its own test; looked at in the preview at phone width
   with two extra screens added for the occasion. The sheet's code loads
   on the first tap, not with the shell: with it eager the first paint
   grew from 164 to 183 KB, lazy it is 165. In passing, the dev proxy now
   follows `PORT`, so a second checkout on the same machine can run on
   another port.
4. **Touch targets, confirmations, history that reads.** One rule in
   `index.css` lifts every registry button and field to 44 px where the
   pointer is a finger; `check-frontend.mjs` refuses a row, link or button
   in a screen, a primitive or the shell with a bare height under 44 px
   (tested). Changing somebody's role and turning somebody off now ask
   first; `ConfirmDialog` can be opened by the screen as well as by a
   button. The actions a record can undergo live once in
   `shared/audit.ts`, read by the column, the contract, the server and the
   history list; a value with no better name is written by
   `lib/history-text.ts` (tested), never as `[object Object]` or an id.
   Not done: the phone screenshots of people and an item — the session's
   usage allowance ran out before they were taken.
5. **`notify()` as an outbox, and problems that reach the owner.** A
   message still goes at once; one that could not be sent keeps its
   address and text and the worker tries again after one, two, four and
   eight minutes before the health page counts it as lost. A message with
   a key is sent once until `resolveNotice(key)`. A job every fifteen
   minutes reads the health page's own problem list and e-mails every
   active owner, once, about a problem seen on two runs in a row; nothing
   on the first run after a start. Migration `0001_notify_outbox`, safe to
   run twice. Six new tests in `notify.test.ts`.
6. **Off-site backups, built in.** When `/opt/<app>/.backup.env` exists
   (four lines the owner writes by hand: the bucket, two S3 keys, the
   restic password), `backup.sh` sends the new dump and the server's
   `.env` to any S3-compatible bucket through restic and keeps 14 daily,
   8 weekly and 6 monthly copies; a failure there is reported and never
   fails the dump. A dot-file marker in the backup folder tells the health
   page when the last copy left; older than two days is a warning, which
   `health.watch` mails. `server-setup.sh` installs restic. Proven by
   `scripts/backup.test.mjs` against stubbed docker and restic, including
   that no key reaches the output. `docs/backups.md` has the set-up and
   the proving restore.
7. **The first-screen budget, in two parts.** The old single number
   measured the entry's static imports only: 165 KB of a 200 KB budget.
   Measured honestly, a first visit downloads 239 KB before any screen can
   render — the shell plus 74 KB that every screen shares and Vite splits
   out of the shell — and the heaviest screen adds 15 KB of its own.
   `check-frontend.mjs` now prints and budgets both: 280 KB before any
   screen, 60 KB for one screen's own weight, and names the heaviest screen
   every run. No translation split: the dictionary is a few kilobytes and
   is not where the weight is. Four new checker tests.
8. **CI on a private repository, and a no-CI mode.** The migration check's
   fetch of `main` carries the run's own token, so it works where the
   checkout keeps no credentials; the guides are built on every docs change
   and published only when the repository variable `PUBLISH_DOCS` is
   `true`; the Tests job is skipped when `INHOUSE_CI` is `off`, the gate
   being `pnpm check` on the laptop; both workflows hand an `NPM_TOKEN`
   secret to `pnpm install` for an app with a private package; the sorts
   that followed the machine's locale name one. `docs/running.md` has the
   section. Not verified on GitHub until the branch is pushed.
