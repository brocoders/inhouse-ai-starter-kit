# Working on this project

This file is read at the start of every session. It holds facts and rules;
procedures live in `.claude/skills/`, folder-specific constraints in
`.claude/rules/`, history in `docs/`. Keep it under 150 lines —
`scripts/check-repo.mjs` fails when it grows past that.

## What this is

A private web application for a known group of people, built by directing an
AI agent. The owner leads a business or a team and does not read code: report
in plain language, as behaviour and consequence, never as function names.
Project-specific facts — what the app does, who its users are — live in
`docs/product.md`. Read `docs/STATUS.md` first in every session.

Profile: `PROFILE=solo|team` in `inhouse.config.json`. In `solo` you review,
merge and release your own work. In `team` you open a pull request and stop.

## Commands

- `pnpm dev` — app and API with live reload · `pnpm test` — fast checks for the
  inner loop · `pnpm check` — everything CI runs, once, before a pull request
- `pnpm db:generate` / `pnpm db:migrate` — schema change and apply
- `pnpm db:copy` — pull a copy of production into the local database
- `pnpm shots /route` — phone and desktop screenshots into `.shots/`
- `pnpm release <sha>` — release to the server (gated; see `/release`)

## Boundaries

**Always:** read the spec or ask for one before new work; run the check that
proves a change; update `docs/STATUS.md` and the relevant doc in the same
change; keep every migration idempotent; filter, sort and page in SQL.

**Ask first:** deleting or rewriting data in production; changing
authentication, roles or session rules; adding a dependency that does what an
existing one does; any change to `deploy/`; spending the owner's money
(new services, accounts, larger server).

**Never:** commit a secret, token, key or server address (the checker blocks
it; `~/.config/inhouse/<project>/` is where they live); edit files under
`components/ui/` (re-add from the registry); modify an applied migration;
write to the production database outside the app or a migration; run the
full suite repeatedly without a new reason; silence an error with an empty
catch or `|| true`.

## How to work

When you have enough information to act, act. Do not re-derive facts already
established, re-litigate a decision the owner has made, or narrate options
you will not pursue. If you are weighing a choice, give a recommendation.

When the owner describes a problem, asks a question or thinks out loud, the
deliverable is your assessment. Report findings and stop; do not fix until
asked. Work goes research → plan → build, with a message between each; a
long silent stretch reads as being stuck.

Plan when the change is uncertain or touches several files; skip the plan
when the diff fits in one sentence. New features start with the
`plan-feature` skill: interview, one-page spec, then a fresh session builds.

Don't add features, refactor or introduce abstractions beyond what the task
requires. Do the simplest thing that works well. Validate only at system
boundaries. Don't use feature flags or compatibility shims when you can just
change the code. Extend an existing mechanism rather than adding a second;
one primary source and one secondary, never a third "just in case".

Pause for the owner only when the work genuinely requires them: a
destructive or irreversible action, a real scope change, or input only they
can provide. Then ask and end the turn rather than ending on a promise.

Before reporting, audit each claim against a tool result from this session.
Reading code is not verification; a claim is verified when a command ran and
its output supports it. If tests fail, say so with the output; if a step was
skipped, say that. Two failures with the same error: stop and re-diagnose.

Finish the whole job. In `solo`, that includes review, merge, release and
removing your worktree. Hand back only what lives in someone else's console,
as a numbered list of exactly what to click and what to send back.

## Models and escalation

Roles by tier: an orchestrator that plans, reviews and integrates; routine
implementers for work fenced by tests; deep implementers for anything that
touches money, authentication, migrations, locks or external input, however
small; an escalation tier for architecture, root causes and being stuck.
Route by what the change touches, not by its size. Tune effort before
switching models. A session cannot change its own model: when a task needs a
stronger one, say so plainly and name why.

Concurrent implementers each get their own worktree and never share a
checkout or a database. Two at a time on one machine. Implementers do not
commit, push or open pull requests; they leave a diff and report what they
could not do. Never hand an implementer credentials or production data.

## Context

Use CLI tools with narrow output over browsers. Read the fragment you need,
not the whole file again. Send noisy research to a subagent. Start a new
session for an unrelated task. Prefer a script, a test or a checked-in query
to re-deriving the same fact each session. Keep `docs/STATUS.md` to a
current-state section plus recent entries; `scripts/archive-status.mjs`
moves the rest.

## Invariants that hold in every app built from this kit

- Every table carries `created_at`, `updated_at`, `created_by`, `updated_by`;
  changes to records people care about land in `audit_log`.
- Lists are paged in SQL with a keyset cursor; the page, not the table, is
  enriched. Indexes ship in the same migration as the query that needs them.
- Times are stored as instants; the app has one time zone and one locale, and
  all formatting goes through `lib/format.ts`. Money, where it exists, is an
  integer in minor units.
- Errors are typed transient / auth / permanent / uncertain and logged as
  JSON with a request or job id and the release version. One failing job
  never stops the worker.
- An LLM proposes; deterministic code decides and counts. The LLM never sees
  credentials, SQL or a shell.
- The design system in `frontend/DESIGN.md` is the only source of colour,
  type and spacing; `scripts/check-frontend.mjs` enforces what a script can.

## Documentation

Commit messages, `docs/STATUS.md` and decision records are written for the
owner: what changed for them and why. Separate planned, implemented, tested
and deployed. Incidents follow `docs/incidents/TEMPLATE.md` and end with a
regression test. Architectural choices get an entry in `docs/decisions.md`.
