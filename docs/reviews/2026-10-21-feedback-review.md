# Review after the first three projects — 21 October 2026

Version 0.1 of the kit was tagged on 23 September 2026 and has not changed
since. In the four weeks after, three projects touched it:

- **LLM Analytics Platform** (`brocoders/llm-analytics-platform`): built
  from the kit on 29 September, 314 commits, about 25 releases to a real
  server with the kit's own release script, unchanged. It kept a
  `docs/kit-feedback.md` — 33 dated lines, all from the first day — and
  recorded later friction in its status file, commit messages and agent
  memory instead.
- **hlyna** (`sars/hlyna`, a Next.js catalogue): did not start from the kit.
  On 11–12 October it replaced Payload CMS with its own admin panel modelled
  on the kit — Drizzle, Better Auth 1.7.5, the audit log, and the panel
  components copied under the kit's MIT licence. It took none of the agent
  layer (skills, hooks, checks).
- **Keepard** (the Personal Finances project, `sars/keepard`): the project
  the kit grew out of. It moved on after the kit was extracted — containers
  on a shared server, off-site backups, an owner-notification outbox,
  credential-expiry watching — and its agent memory holds 58 lessons.

This review collects what they found, checks the claims that can be checked
against the kit's code, and ranks what to change for version 0.2. Each item
is marked **verified** (I checked the kit's code or scripts this session),
**reported** (the project's own record says so) or **inferred** (my
reading). Sources are tagged [P] platform, [H] hlyna, [K] Keepard, [R] the
kit's own pre-release review.

## The short version

1. **The kit does not survive its first release or its first agent session
   as shipped.** Four separate defects stopped the platform's first release
   (four attempts); five more made the first hour harder than the guide
   promises; and the sandbox, the command guard and the file-protection hook
   each refused something an ordinary session needs. All verified; none
   fixed in the kit. This is the whole of version 0.2.
2. **The agent layer held, but only inside one checkout per session.** Two
   projects had three incidents of two sessions writing to one working copy.
   The kit's rule covers implementers in worktrees and says nothing about
   two chats.
3. **Every real project needed the same five things the kit left as
   "recipes":** a server that already hosts another app, off-site backups,
   problems that reach the owner's phone, jobs that run every few minutes,
   and a tab bar that survives more than five screens. Two projects built
   each of them independently and differently. These are version 0.3.
4. **The feedback channel decays after day one.** The platform wrote 33
   lines on 29 September and none afterwards, although at least twelve real
   kit defects surfaced later. hlyna wrote no feedback at all. The kit needs
   a lighter way to receive it than a file the project has to remember.
5. **Good news that belongs in the status file:** the deploy folder's
   "unverified without Docker" list is now verified by proxy. The image
   build, the Compose bring-up, the lock, the rehearsal restore and the
   backup timer have run about 25 times on the platform's server with the
   kit's scripts byte-identical.

## 1. Defects that stop a first release or a first hour

All verified against the kit at `ff5f7a1` unless marked.

| #    | Defect                                                                                                                                                                                                                                                              | Source | Consequence                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | `server/src/db/index.ts` imports `@electric-sql/pglite` unconditionally; `package.json` lists it under devDependencies, so the production image has no such package.                                                                                                | [P]    | First release fails at the migration.                                                                                           |
| 1.2  | `server-setup.sh` writes `RESEND_API_KEY=` and `EMAIL_FROM=` as empty lines "to fill in later"; `config.ts` validates them with `min(1)` and refuses the file.                                                                                                      | [P]    | First release fails at the migration.                                                                                           |
| 1.3  | The image carries `dist/` only and `scripts/seed.ts` is not compiled into it (the Dockerfile copies no scripts).                                                                                                                                                    | [P]    | A fresh server has no way to make its first owner, and no documented way to read the first sign-in link without e-mail.         |
| 1.4  | `frontend/index.html` bootstraps the theme with an inline script; the production policy is `script-src 'self'`.                                                                                                                                                     | [P]    | A violation on every page and a light flash for dark-theme users. Never seen in development, where Vite sets no policy.         |
| 1.5  | The `release` skill says the gates are "build, tests, a rehearsal…" and "it takes up to an hour… the test phase". `deploy/release.mjs` has no test step (unpack, build, backup, rehearsal, migrate, switch, verify, prune) and the Dockerfile only builds.          | [K]    | The agent and the owner believe a release is test-gated. It is gated by `pnpm check` on the laptop, by hand, if at all.         |
| 1.6  | `scripts/db-copy.mjs` runs `docker compose -f <deploy.dir>/compose.yaml`; the release layout keeps it under `current/` with two env files.                                                                                                                          | [P]    | `pnpm db:copy` fails against any server the kit's own release set up.                                                           |
| 1.7  | Deleting the example job leaves its row in `schedules`; `schedules.ts` never removes a schedule whose job the code no longer declares.                                                                                                                              | [P]    | Health warns "due and had not run" for ever, from the first day of every real app (the setup skill says to delete the example). |
| 1.8  | `/setup` writes the app name, time zone and locale into `inhouse.config.json`; the local app reads `APP_NAME`, `APP_TIME_ZONE`, `APP_LOCALE` from `.env`, which the agent may not write; the name is also hard-coded in `en.ts`, `index.html` and `vite.config.ts`. | [P]    | The owner sees "InHouse" and UTC after setup. The pre-release review fixed this for the server only.                            |
| 1.9  | `pool.on('error', () => {})` swallows a lost database connection.                                                                                                                                                                                                   | [K]    | Breaks the kit's own "no empty catch" rule; this exact silence cost Keepard a day of imports on 23 September.                   |
| 1.10 | Node: `engines` pins `<25`; Node 26 becomes LTS on 28 October 2026, a week from now, and the first creator already arrived with Node 26. `/setup` does not check Node or pnpm.                                                                                      | [P]    | The first command of the first hour fails on a fresh Mac.                                                                       |
| 1.11 | The worked example's "somebody else changed this" check reads, compares `updatedAt`, then writes without it in the `where` (`items.ts` line 201 onwards).                                                                                                           | [P]    | Two saves at the same moment both win. The example is the pattern every app copies.                                             |
| 1.12 | Every script prints pg's deprecation warning from the `set time zone` in the pool's connect handler.                                                                                                                                                                | [P]    | The first line of every seed and import reads as an error to the owner. Reported, not verified.                                 |

Smaller, same class, reported: the release log is flooded by image-pull
progress and a `NOTICE` from the rehearsal (`--quiet-pull`, `-q`); the CI
whitespace step `git show --check HEAD` on a depth-1 checkout examines the
whole tree; `docs.yml` cannot publish Pages from a private repository; the
`/setup` interview surfaced "Failed to read release skill" to the owner.

## 2. The agent session: sandbox, guard, hooks

The kit's promise is that auto mode is comfortable because the sandbox and
the hooks fence the agent. In practice the fences hit ordinary work.

- **pnpm cannot run inside the sandbox** (store lock in a read-only temp
  folder): `pnpm install`, `pnpm add`, `pnpm db:generate` all failed and the
  platform's agents standardised on `node --run <script>`. The kit's docs
  name `pnpm` everywhere. Reported [P]; the kit's own docs/agents.md says
  nothing about it.
- **`pnpm check` cannot run inside the sandbox**: `format:check` is
  Prettier over `.`, which enters `data/`, a folder the sandbox hides, and
  stops with EPERM. The platform ran it as five commands. Verified: no
  `data` line in `.prettierignore`.
- **The sandbox hides `data/`**, so `pnpm db:seed` and reading the dev mail
  outbox go through the owner's terminal. The rule for `./.env` also matches
  `.env.example`. Reported [P].
- **The command guard refuses scratch work**: `rm` of a file under
  `$TMPDIR`, any command whose argument is a `$VARIABLE`, `git` chained with
  another command. The lab copy allows `/tmp`; the platform's agents keep a
  list of workarounds. Reported [P]; the guard's tests in the kit show no
  `$TMPDIR` case (verified).
- **The write hook refuses Claude's own memory folder and the session
  scratchpad**, so a lesson cannot be kept where the tool keeps lessons; the
  platform committed `.claude/agent-memory/` instead. Reported [P].
- **The desktop app's preview sets `PORT`**, the API takes 5173 and the
  sign-in link lands on a bare 404. Workaround: `.claude/launch.json` with
  `env PORT=3000`. The kit ships no launch file (verified).
- **Local ports and localhost are closed in the sandbox**, so `pnpm shots`,
  `curl` against the dev server and any socket test fail unless the sandbox
  is off. The kit's `test` script has no sandbox-aware skip. Reported [P].
- **The format hook runs on Edit and Write only**, not on files changed
  through Bash. Reported [P].
- **A fresh worktree has no `node_modules`**; a symlink gives the wrong
  package version and breaks the frontend build. Nothing in the implementer
  agent or any skill says how to set up a worktree. Reported [P].

These are not one project's taste: hlyna, which took none of the kit's
hooks, independently wrote the same guard (no `reset --hard`, no `down -v`,
no `rm -rf` outside rebuilt folders) and the same stop-time typecheck — and
the same `/tmp` allowance.

## 3. Two sessions, one checkout

The kit says concurrent implementers get worktrees and never share a
checkout. Nobody disputed that. What happened instead is that the owner ran
two top-level chats in one working copy:

- [P] 29 September: the status snapshot printed at session start was stale
  by the time the session edited the file, because another chat had
  released in between. 30 September: frontend files changed and were
  reverted mid-task by another session.
- [H] 12 October: another session merged and pushed a deploy script while
  this one was committing. 16 October: a staged `git mv` was swept into
  another session's commit and broke the production build; reverted.

hlyna wrote the discipline into memory: `git add` explicit paths, never
`-A`; never leave anything staged between steps; fetch and look before each
commit; rebase before push; deploy from a clean worktree. The kit has no
rule for this case, and the session-start hook cannot tell a session that
the status file moved under it. Inferred: the cheapest fix is the discipline
as four lines in AGENTS.md plus a session-start note of the status file's
last commit, so a later edit can be compared.

## 4. Things every real app needed and had to build

The test I applied: did two of the three projects need it independently?

| What                                                  | Who built it, how                                                                                                                                                                                                                                                                                      | Kit today                                                                                                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A server that already hosts something**             | [P] walked `server-setup.sh` by hand and took five lines of it; [K] moved onto hlyna's server behind a shared edge Caddy (ADR 0009). Both needed a distinct folder and `APP_SLUG`, or Compose removes the neighbour's containers as orphans.                                                           | `server-setup.sh` assumes a fresh Ubuntu; `deploy.dir` defaults to `/opt/<alias>`; `docs/server-requirements.md` says "never restart anything outside this project" and stops there. |
| **Off-site backups**                                  | [K] restic to S3, versioned bucket, config snapshot too, retention not automated until a restore is proven; [P] `age`-encrypted dump plus files plus `.env` to Backblaze under Object Lock, a `backup_runs` table and a Health card. Two keys were rotated after the agent echoed them while checking. | `docs/backups.md` says "ask the agent for the off-site recipe; about twenty lines". There is no such recipe (verified: no file).                                                     |
| **Problems reach the owner**                          | [K] an outbox with lease, once-per-incident key, cooldown and recovery message; a connection stopped for three hours is sent to Telegram once. [P] a "Send now" card and typed Resend errors.                                                                                                          | `notify()` writes one row and sends once; no retry, no dedup, and the health page's problems are never pushed anywhere (verified: no retry in `notify/index.ts`).                    |
| **Jobs every N minutes**                              | [P] added `{ everyMinutes }` with tests for a device mirror, a backup sender, a balance check. [K] has interval jobs throughout.                                                                                                                                                                       | `Spec = { daily: 'HH:MM' }` only (verified).                                                                                                                                         |
| **A tab bar for more than five screens**              | [P] four tabs plus "More" opening every screen from the left; [H] four tabs plus «Ще» sheet.                                                                                                                                                                                                           | Every screen in the bar; eight overlap. Reported [P].                                                                                                                                |
| **Touch targets and confirmations in the primitives** | [H]'s review of the copied components: 16–32 px targets, no confirm on approve/publish/make-admin, raw keys and UUIDs in the history list, a phone filter bar that fills the first screen. All fixed there.                                                                                            | DESIGN.md requires 44 px rows; the primitives do not meet it (reported [H], the kit's components were copied unchanged).                                                             |
| **History that reads as sentences**                   | [P] "changed lastExit from [object Object] to [object Object]"; adding one action meant editing four files. [H] added label maps and an `actionLabel` prop.                                                                                                                                            | Action vocabulary spread over the schema enum, `audit.ts`, `shared/schemas.ts` and `HistoryList` (reported [P]).                                                                     |
| **The Drizzle `${table.column}` trap**                | [P] and [H] each lost a day to it independently: inside a raw SQL subquery the column renders without its table and binds to the inner table, so a count is always zero and a test expecting zero passes.                                                                                              | Not in `.claude/rules/database.md` (verified).                                                                                                                                       |
| **A private package at build time**                   | [P] a Docker build secret, the registry line in the repo's `.npmrc`, the credential in the owner's `~/.npmrc`, and `minimumReleaseAgeExclude` for its own packages.                                                                                                                                    | No place for it.                                                                                                                                                                     |
| **First-screen budget**                               | [P] hit the 200 KB ceiling on day three with "10 bytes left" and split `en.ts` into first-paint words plus lazy per-area files, with a new check that every key a chunk uses is loaded.                                                                                                                | One `en.ts` loaded eagerly; `t()` returns the bare key for a missing word, silently.                                                                                                 |
| **CI on a private repo**                              | [P] red for four days (GitHub Packages auth, no credentials for the "fetch main" step, whitespace check on a shallow clone, a locale-dependent sort); Pages deleted. [K] burned 13,900 minutes a month before the kit existed; the lab repo runs with no CI at all.                                    | The kit's workflows assume a public repo with no private packages; the decisions record names a "no CI" mode that does not exist.                                                    |

## 5. Rules the projects learned that the kit does not say

From Keepard's memory and documents, filtered to what applies to any app.
Each is a sentence or two in the right home; none needs code.

- **The orchestrator reads the diff, never the report.** A subagent's
  claim is not evidence; a changed or deleted test is the highest-risk
  edit. The reviewer agent covers "tests that moved"; nothing tells the
  orchestrator. (Also true of this review's own method.)
- **The brief contract.** A subagent starts empty: working directory and
  branch, toolchain, files to read first, the spec, the invariants, the
  tests to add, the exact verify command, "report what you could not do".
- **Check the project's own route before reporting a blocker.** A refusal
  means this shape of the action was refused, not that the capability is
  absent; a limitation written into memory must say when it was verified
  and be re-tested — two of Keepard's "blocked" notes were wrong.
- **`gh pr merge --auto` merges at once** on a repo with no required
  checks; wait for green, then merge plainly.
- **Research is not a commit.** A diagnostic question does not authorise
  writing the findings into the repo and merging them.
- **Circling is an escalation trigger**: the same ground re-covered across
  turns, or a pile of recorded decisions with no document that makes them
  cohere.
- **Make a check able to fail.** Keepard's first restore comparison
  reported 50 identical tables while both sides were empty; `pnpm check |
tail` can never fail because tail's exit code wins.
- **A data migration must be conditional on its data**, or it seeds every
  fresh install and test fixture.
- **A cleanup on the happy path only runs on success**; install the trap
  first. (The kit's release script does this; the rule is unstated.)
- **Repair the server as code through a release, not by hand over ssh.**
  The auto-mode classifier blocks `ssh host 'sudo …'` and lets a scripted
  release through.
- **Diagnosed facts belong on a screen.** If explaining a symptom needed
  the agent to read something over ssh that the app cannot show, showing it
  is part of the fix.
- **Automation never overwrites a person's decision.** The kit's invariant
  says "an LLM proposes; code decides" and stops there.
- **For an AI feature**: reserve the worst case, not an estimate; an
  uncertain call keeps its reservation; unknown prices fail closed; never
  call a model with an empty vocabulary (four paid failures on 11
  September); when the allowance runs out only the AI part stops; a
  rollback to code before the gate removes the gate; ask the owner what
  may be sent to the model and record it.
- **Never echo a `.env` line while checking it.** Two keys were rotated on
  1 October because the agent printed them.

## 6. Deviations the projects chose, and what they tell the kit

- **Desktop first for data-heavy screens** [P]. Recorded in a handover
  document and in specs, never in AGENTS.md or DESIGN.md, so a fresh
  session still reads "phone first". The kit should make room for a
  per-screen choice, and — more generally — say where an app records an
  override of a kit rule so that a new session sees it.
- **Multi-tenancy** [P] (several companies, `company_id`, host-derived
  cookie, on-demand TLS). The kit's "not multi-tenant" rule was set aside
  "on purpose" in the decisions record. Keep the rule; the platform's notes
  are a ready recipe for the day another app needs it.
- **No e-mail at all** [H]: all Better Auth e-mail paths disabled, one-time
  invite links shown to the admin or sent to Telegram, phone logins through
  a synthetic address. Evidence that "sign-in without an e-mail provider"
  is a real first-day need; the kit's dev outbox covers it locally but the
  server has no path (see 1.3).
- **Revisions with restore** [H] beside the audit log, because "who changed
  what" and "put it back" are different questions. Not for the kit's core;
  worth a recipe line.
- **Real Postgres in tests, not PGlite** [H], because of `text[]`, GIN and
  generated columns. The kit's position (PGlite plus one real-Postgres job)
  stands, but the pitfall list in the database rule should name those
  three.
- **What was copied and then deleted** [H]: `PagedList`, `Amount`, five
  registry components and TanStack Query/Virtual, flagged by `knip`. [P]
  never used `Amount`, `BarList`, `BucketBars`, `Sparkline` or the CSV
  helper. Inferred: the chart vocabulary is ahead of demand; leave it, but
  do not grow it.

## 7. What the kit got right

Worth saying because the next version should not disturb it.

- The release script worked unchanged for about 25 releases, with a backup
  and a rehearsal every time, typically in four to five minutes. [P]
- The contract-first design, the paged list, the form field, the status
  badge, the history list and the confirm dialog were the most-used pieces
  in both apps that copied them. [P] [H]
- hlyna chose to rebuild on the kit's patterns over keeping a CMS,
  naming "an agent finds it easier to work from written rules than from
  CMS config magic" as a reason, and did it in a day against a five-week
  estimate. [H]
- Keepard's agent memory, read against the kit's AGENTS.md and skills,
  is almost entirely already absorbed. [K]
- The skills that leave traces were used as intended: 13 specs from
  `plan-feature`, 26 migrations from `db-change`, every release through
  `release`. [P] The `incident` skill was never used although incidents
  happened — they went into the status file — which says the template is
  heavier than the habit.

## 8. Priorities for version 0.2 and 0.3

**Version 0.2 — "runs as shipped".** Everything in sections 1 and 2, in
this order, because each item below stopped a real release or a real
session and all are small:

1. The four release stoppers: PGlite into dependencies (or a conditional
   import), empty env values count as unset, the seed compiled into the
   image with a documented "first owner on the server" path, the theme
   script as a file. Plus `db:copy` against the real layout, and stale
   schedule rows removed.
2. The release skill's text matched to the script (no test phase, no hour),
   and the release's verification line for a change with no screen.
3. One home for the app's facts in development too: `pnpm dev` reads
   `inhouse.config.json`; the name hard-coded in three frontend files
   replaced by one.
4. The sandbox made workable: `.prettierignore` covers `data/`; docs and
   skills say `node --run`; the guard allows `$TMPDIR` and the scratchpad;
   the write hook allows the memory folder; a `.claude/launch.json` pins
   the port; the test script skips socket tests when ports cannot bind;
   docs/agents.md gains a "what the sandbox stops, and what to do instead"
   list. `/setup` checks Node and pnpm and prints the two install commands.
5. Node 26: widen the engine range deliberately before 28 October.
6. The pool error logged; the conflict check in the worked example written
   correctly; the Drizzle trap and the three PGlite gaps in the database
   rule; the pg warning silenced.
7. Two chats, one checkout: the four-line discipline in AGENTS.md, and the
   session-start hook printing the status file's last commit.
8. The rules in section 5 placed in their homes (most are one sentence in
   AGENTS.md, `verify`, `debug`, `ai-feature` or the implementer agent).
9. Status file updated: the "unverified without Docker" list is verified by
   proxy; the feedback file of the platform referenced as the source.

**Version 0.3 — "what every app needed".** Section 4, in rough order of how
many projects needed it: a shared-server path for `server-setup.sh` with
an explicit folder and slug; one vetted off-site backup implementation
(pick restic-to-S3 or age-to-B2, not both) with the key-handling rules;
`everyMinutes` schedules; a notify outbox with retry and a once-per-problem
key, and persistent health problems pushed to the owner; the tab bar with
"More"; the touch-target and confirmation pass over the primitives; one
home for the history vocabulary and flattened object values; the lazy
per-area translation split with its check; CI that works on a private repo
and a documented no-CI mode; the private-package recipe; a "desktop first
for this screen" flag and a stated place for an app's overrides.

**Not for the kit.** Multi-tenancy, Telegram, revisions with restore, a
Next.js variant, credential-expiry ladders and container hardening are
real but belong to recipes or a later version; two of them (hardening,
expiry) are cheap and generic enough to reconsider for 0.3.

**The feedback loop.** The `release` skill's closing step should ask one
question — "did anything in the kit get in the way since the last
release?" — and append the answer to `docs/kit-feedback.md`, which the kit
should ship as an empty file with that header. A feedback file the project
must remember on its own stops on day one; we have the evidence.

## Method and limits

Three fresh-context readers each covered one project and reported with
sources; I verified against the kit the claims in section 1 and the
mechanisms in section 4 marked verified, by reading the kit's code and
scripts, not by running them. Nothing was run on a server. Reported items
rest on the projects' own records; where a project's record and the kit
disagree, the kit's code was read. I did not diff every copied component in
hlyna against the kit, and I did not read the platform's 2,600-line status
file in full — only the entries its reader surfaced.
