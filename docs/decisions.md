# Decisions

The record of what was decided while shaping InHouse, and why. One entry per
decision, newest at the bottom of its section. Rewrite an entry when the
decision changes; do not append a contradiction beside it.

Decided with the owner between 20 and 22 September 2026, before any code
existed. Sources are noted where a decision leans on outside evidence:
_PF_ = the Private Finances project the kit grew out of, _ANT_ = Anthropic's
Claude Code and model documentation, _EXT_ = another starter kit or guide.

## Purpose and audience

- **Name:** InHouse AI Starter Kit. Repository `brocoders/inhouse-ai-starter-kit`,
  a page on bcboilerplates.com, the guides on GitHub Pages. "In-house" is the
  business word for software a company builds and owns itself; the tagline
  carries that meaning for readers who hear "home" in it.
- **For whom:** founders, leaders and managers who want their own system for
  how their company, team or community works, instead of spreadsheets, an
  expensive or ill-fitting SaaS, or a tool that almost does the job. They
  direct an AI; they do not read code. Personal systems (a household, a side
  project) are welcome but are not the lead persona.
- **Users of the resulting apps:** the company, team or community the creator
  leads — people they know by name. No public sign-up. Roles are owner,
  member, viewer.
- **Size of project:** weeks, not months. One to a few screens a week. Not
  multi-tenant, not for thousands of concurrent users. The first real screen
  must exist within an hour of cloning.
- **What gets built:** a private web app that is the system of record for one
  part of a business or life — it stores the records, shows the current
  state, and answers questions about it. Phone first, installable, behind a
  login, one database with change history, scheduled jobs and notifications,
  optional AI helpers, on one rented server.
- **What it is not for** is written only in the agent rules (to protect the
  stack), never in customer-facing text.
- **Brocoders presence:** light — a footer line and one sentence; removable by
  the creator.

## Ecosystems and models

- **Claude Code first.** OpenAI Codex is supported as a secondary target
  through the shared `AGENTS.md` and Agent Skills standard; Claude-only
  features (hooks, auto memory) are backed by CI so nothing silently fails
  under Codex. Full Codex parity is a to-do, not part of version one.
- **Models:** orchestrator on Claude Opus 5; routine implementers on Sonnet 5;
  Fable 5.1 used freely whenever a task is hard, not rationed. The agent says
  out loud when it switches tiers, because a session cannot change its own
  model. (_PF_ agent-development-model, _ANT_ Fable 5.1 "choosing a model".)
- **Effort before model:** tune effort first, then switch models. (_ANT_.)
- **Token discipline stays** — not to save money, but because a cluttered
  context makes any model slower and worse.
- **Budget assumption:** creators can spend USD 100–500 a month on AI
  subscriptions. Max 20x is the recommended plan.

## How the creator works

- **Where the AI runs:** both local (Claude Code desktop, Mac or Windows) and
  cloud (Claude Code on the web / Projects). Guides document local first,
  because the creator must open the app on their own machine and phone before
  releasing.
- **Safety:** Claude Code's built-in sandbox plus auto mode is the default; a
  dev container is documented for Windows and for anyone who wants Postgres
  locally. Destructive-command hooks are the second fence.
- **Two profiles, one setting:** `solo` (the agent merges and releases on its
  own, no second review) and `team` (a review step before merge). Nothing
  finer.
- **Interview → spec → plan → build → show → release.** New work starts with
  questions and a one-page spec; the AI shows a sketch, wireframe or
  screenshot — whichever fits; a one-line change skips the plan. (_ANT_ best
  practices, _PF_ research-then-plan-then-build.)
- **The agent finishes the whole job** in `solo`: review, merge, release,
  tidy. Only steps that live in someone else's console are handed back, as a
  numbered list. (_PF_.)

## What every app gets (core)

Sign-in with roles and invite links · users table with a role column (no
workspace table — that is multi-tenancy in disguise) · change tracking
(created/updated at/by on every table plus one generic audit log, no history
UI beyond a plain list) · fast lists (server-side filtering, keyset paging,
virtualised rows, filters in the URL) · record pages and forms with
validation · file attachments on local disk · scheduled jobs on a jobs table
(no Redis) · one `notify()` function with e-mail built in · health page that
shows only what is wrong · structured JSON logs with request/job ids and
release version · design system with a checker · installable PWA with update
prompt and pull-to-refresh · CSV download helper · dev seed script · basic
security on by default (HTTPS only, login rate limit, security headers,
secrets file permissions, session expiry) · one app-level time zone and
locale · English only, every string through one translation helper so a
second language is mechanical · Docker Compose · one-command release with
gates · nightly local backup plus the provider's snapshot · safe copy of
production for debugging · the agent setup.

One worked example entity end to end (list, detail, form, audit, a job, a
notification) as the pattern the AI copies; `/setup` can delete it.

## Deliberately left out of version one (recipes, not code)

Dashboards and reports as features (the components ship; the recipe explains)
· spreadsheet import tooling (a recipe describes the one-time migration) ·
demo mode · Telegram, Slack, web push (recipes; `notify()` is channel-
pluggable) · SMTP (a provider API key instead) · S3 storage (adapter as a
recipe) · approvals, comments, multi-workspace · settings table · Sentry ·
staging server · custom roles · Ukrainian or any second language.

## Stack

Fixed so the agent never debates it. Versions verified in the research pass
(see `docs/stack.md` once written).

- Node 24 LTS, TypeScript strict, pnpm with a frozen lockfile.
- **Hono** server with Zod at every boundary and the typed client for the
  SPA. Chosen over Fastify for less glue code: less for the AI to write and
  get wrong.
- **PostgreSQL 16** with **Drizzle** (schema in TypeScript, generated
  migrations); raw SQL allowed for reports. PGlite in tests plus one real-
  Postgres job in CI. (_PF_ incident: PGlite is not proof of Postgres
  compatibility.)
- **Better Auth**: e-mail + password and magic link, invites, sessions. No
  social logins.
- React 19, Vite, Tailwind 4, shadcn + Base UI, TanStack Router / Query /
  Virtual, vite-plugin-pwa, Recharts loaded lazily, Lucide, date-fns.
- Tests with Node's test runner and PGlite snapshots; Playwright only for
  screenshots. Prettier. Checker scripts in Node — one runtime (PF used
  Python; the kit does not).
- E-mail through Resend's API (one key). Files on a Docker volume.
- Docker Compose: `app`, `postgres`, `caddy`. Not TanStack Start (still RC).
- Design: the Tremor-style quiet, dense, numbers-loudest look as default.

## Operations

- **One Ubuntu VPS**, provider of the creator's choice (region decides data
  location; one paragraph explains what that means for EU companies).
  Docker Compose, Caddy for HTTPS. Hosting-provider-neutral; Dokploy named as
  the dashboard alternative.
- **Release** in one command with gates: build, tests, migration rehearsal on
  a restored copy, backup, refuse an older release unless told, switch,
  verify, prune. (_PF_ incidents of 14 and 19 September 2026.)
- **Backups:** nightly `pg_dump` kept 14 days on the server plus the
  provider's snapshot checkbox. Second server or S3 as recipes, with the
  trigger spelled out ("the day the app is business-critical").
- **Debugging production:** work on a copy pulled into the dev environment
  (`db:copy`, optionally anonymised); a read-only database role through the
  SSH tunnel for the rare live question; diagnosis queries checked in. Never
  write to production outside the app or a migration.
- **Errors:** no Sentry. Structured logs plus a health page listing the last
  24 hours' errors; the agent reads the same log over SSH. Sentry is a
  recipe.
- **Logs:** journald, 30 days, nothing shipped elsewhere.
- **CI on a private repo:** a small fast suite by design (under three
  minutes), docs-only changes skip tests. Options documented in order:
  GitHub-hosted runners within the free minutes; a self-hosted runner on the
  production server with a CPU limit (the default recommendation); a second
  small server as runner, backup target and debug copy. (_PF_ burned the free
  minutes in four days.) Since 0.3 the workflows work on a private
  repository as shipped (the migration check fetches `main` with the run's
  own token; the guides are built always and published only when the
  repository variable `PUBLISH_DOCS` is `true`), and the no-CI mode is a
  repository variable, `INHOUSE_CI` = `off`, that skips the test job: the
  gate is then `pnpm check` on the laptop. A variable rather than a deleted
  workflow, so turning CI back on is a setting and not a revert.
- **No staging** by default.
- **Dependencies:** Dependabot weekly, grouped, applied by the agent in one
  PR.

## Rules, checks and instructions

- Anything mechanical is checked by a script triggered by hooks and repeated
  in CI: formatting, instruction-file size limits, design tokens, text typed
  into a screen instead of going through `t()`, secrets, bundle size. The AI is
  kept for judgment. Migrations are the one rule with three fences: the write
  hook refuses an edit to an existing migration, a permission rule asks before
  one, and `check-repo.mjs` fails when a `server/drizzle/*.sql` file that is on
  `main` differs from it (skipped in a clone without `main`, such as CI's
  shallow checkout). The migrator records what it applied, so a migration runs
  once; "safe to run twice" is the author's job, not a checker's.
- Instructions are compact and never repeat each other: one home per rule;
  `AGENTS.md` under 150 lines holds facts; procedures live in skills;
  folder-specific constraints in `.claude/rules/`; a script fails the check
  when the always-loaded file grows past its budget. (_ANT_ steering guide,
  _EXT_ agents-md.)
- Three-tier boundaries (always / ask first / never) in `AGENTS.md`. (_EXT_.)
- Anthropic's own sentences against over-planning, over-building and asking
  at the wrong moment go in verbatim. (_ANT_ Fable 5 prompting guide.)
- Auto memory conventions: one lesson per file, why and how to apply, index
  under 200 lines. (_ANT_, _PF_.)

## Guides

Customer-facing guides are a small documentation site (Astro Starlight)
built from the repository and published on GitHub Pages, with one consistent
style: one screen where possible, numbered steps each saying what you should
see, one diagram per guide, an "if this went wrong" line, a five-word
definition for every technical term, and a glossary. Step-by-step everywhere
something cannot be automated (domain DNS, e-mail provider key, hosting
account). Guides planned: Start here · Your first app in an afternoon ·
Publishing to your server · Daily use · What's built in · When something
breaks · Costs and subscriptions · Recipes · Glossary.

## Kit maintenance

- MIT licence for the kit; the creator's app is entirely theirs.
- Semantic versions, plain-language changelog, "last verified" dates on stack
  and price tables.
- Distributed as a GitHub template first; an `update` skill that diffs the
  kit's managed files into a project is a later addition.
- Validation: the owner builds a real project on it next and feeds back;
  the kit is also exercised by building two recipe apps.
- **Version 0.2 (21 October 2026) fixes only what stopped a first release or
  a first session** on the three projects that used the kit; the review is
  `docs/reviews/2026-10-21-feedback-review.md`. Choices made there: PGlite
  ships in the production image rather than behind a conditional import
  (a few megabytes against a second code path every reader must hold);
  the app's name, time zone and locale are read from `inhouse.config.json`
  in development, `.env` still winning, so `/setup` has one place to write;
  the seed script is compiled into the image so a fresh server makes its
  first owner from inside the container; a blank `.env` line means "not
  set"; the guard and the write hook allow a session's own scratch files
  and memory folder; Node 24 or 26 are both accepted. Mechanisms every app
  needed and built itself (shared server, off-site backups, an outbox for
  problems, interval jobs, a "More" tab) are version 0.3, not this one.

- **Version 0.3 (October 2026) builds what every app needed** — the
  mechanisms section 4 of the same review found two projects had each built
  for themselves. The spec is `docs/specs/version-0.3.md`. Choices made
  there: a shared machine gets `server-setup.sh --shared`, which reads the
  machine and writes only the app's files, and `deploy.edge: "host"`, under
  which the kit's Caddy is never started and the app is published on
  `127.0.0.1` for the machine's own web server — a second compose file laid
  over the first, rather than a conditional inside `compose.yaml`, so the
  file every server reads stays one file. Stopping on a taken port, rather
  than warning, because a Caddy that cannot bind fails later and less
  clearly. Interval jobs count from the moment the last run was queued, not
  from the top of the hour, and are capped at a day: anything slower is a
  daily job, and alignment to the clock is what piles every job on every
  machine onto the same minute. The tab bar keeps five tabs and folds the
  rest under More from the sixth screen — four plus More, not five plus
  More, because More is a tab too and six do not fit a thumb. Touch
  targets are enforced by one stylesheet rule on coarse pointers rather
  than by editing the registry's components, which the kit never edits;
  role changes and deactivation ask first, activation does not, because
  only the irreversible gets a confirmation. The outbox sends first and
  retries only on failure, rather than queuing everything for the worker:
  a sign-in link must not wait for a tick, and a process with the worker
  off must still send. A keyed message blocks its key while sent or
  waiting, not after it gave up, so a problem nobody was told about is
  told again. The health watch tells owners on the second sighting, a
  quarter of an hour apart, because the page's own thresholds already
  filter noise and one more interval costs nothing a person would notice.
  Off-site backups use restic to any S3-compatible bucket, not `age` plus
  an upload tool: one binary from Ubuntu's own repository encrypts,
  uploads, keeps copies and restores, and the provider stays the owner's
  choice. The server's `.env` goes with the dump, because a rebuilt server
  with data and no secrets is half a restore. Retention is automated from
  the start, with the proving restore a documented step rather than a
  gate, because a copy nobody prunes is the one that fills the bucket. An
  off-site failure does not fail the backup or the release that called it:
  the dump on disk is real, and the stale marker reaches the owner. The
  first-screen budget became two numbers instead of a lazy translation
  split: measured from the built chunks, a first visit downloads 239 KB
  before any screen (the shell plus what every screen shares), and the
  heaviest screen adds 15 KB of its own, so the words were never the
  weight and a split would have added a mechanism every screen must get
  right for a few kilobytes. 280 KB before any screen is the kit's floor
  plus room for two ordinary libraries; 60 KB for one screen's own weight
  is four times the heaviest today, and the checker names the heaviest
  screen on every run so the day one grows the number says which. Sorts in
  the checkers and the log name a locale or compare bytes, because a bare
  `localeCompare` follows the machine and CI and a laptop disagreed.

## Open

- Provider names and step lists for the hosting guide (Hetzner, DigitalOcean,
  Hostinger are the candidates).
- Whether TanStack Form earns a place or plain forms with Zod suffice
  (research pass).
- Before the first tagged version, a six-angle review of the whole kit,
  findings reported before fixes: fit for the who and the what; our own rules
  and requests; code review; code quality; best practice for agent-driven
  development; and the goal itself — a more predictable, reliable, faster and
  robust way for a creator to build their system. (Owner, 22 September 2026.)
- Dev database: PGlite on disk under `data/dev` when `DATABASE_URL` is
  unset, so `pnpm dev` needs no Postgres install and no Docker on the
  creator's machine; Postgres in production and in one CI job.
- The screenshot script signs in through `DEV_AUTO_SIGN_IN_EMAIL`, a
  development-only setting the server refuses in production.
