# Review before anyone builds on the kit — 23 September 2026

Six angles, as the owner asked on 22 September: does it fit the people it is
for; does it obey the rules we set and the requests made along the way; is the
code correct; is the code good enough to be copied; does it follow what is
known about building with agents; and does it serve the goal — a more
predictable, reliable, faster and robust way for a leader to build their own
system. Findings first, then what was done about them.

The material: the whole tree at `d58298a`, `pnpm check` green (145 tests), a
fresh-clone run to a signed-in app in under two minutes, real screenshots of
every screen, a 44-finding adversarial review by a fresh-context agent, and
three fix rounds that closed 48 findings (the reviewer's plus what
integration surfaced).

## 1. Fit for the who and the what

**Holds.** The README, the start-here guide and the setup skill all speak to a
leader who will not read code, in the register we agreed: what they will see,
what only they can do, no jargon without a definition. The example entity is
neutral enough for a CRM, an approvals flow or an asset register to grow from
it, and the first-hour promise is real: clone → install (6 s) → seed → `pnpm
dev` → signed-in app was measured at well under the hour, with no Postgres or
Docker on the laptop.

**Watch.** Two of the personas — the ops leader replacing a SaaS, the
community leader — will want an approvals flow and a members-with-dues shape
on day two. Both are recipes, not code. That was the deliberate choice (keep
the core minimal); it should be re-checked after the first pilot rather than
assumed. The home page promised "works offline"; it does not by design, and
the sentence was removed.

## 2. Our rules and requests

**Holds, after fixes.** Everything the owner asked for is present: one
compact instruction file (130 lines, budget-checked), two profiles, the
Anthropic sentences against over-planning and over-building, contextual skills
instead of one long document, mechanical rules checked by scripts, the PWA
update prompt and pull-to-refresh kept, one home per fact, Codex readable
through `AGENTS.md` and `.agents/skills`, a safe copy of production for
debugging, provider backups instead of S3, English only with a translation
helper, no Telegram, no demo mode.

**Found and fixed.** The rules were prose in five places and fences in none:
Bash could write files the write hook protects, `rm -rf` had four one-line
bypasses, and `Bash(node *)` walked around the release prompt. Time zone and
locale lived in three places and the server ignored the one `/setup` writes.
The setup skill quoted a seed command that could not run. All closed: the
guard is a tested pure function, permission rules mirror the hook, the release
script carries the app's facts from `inhouse.config.json` to the server on
every release, and `docs/agents.md` says which rule is enforced by what.

## 3. Code review (correctness and security)

**Before fixes, the kit did not run as shipped.** `/api/users` returned an
array where every screen expected a page, so People was always empty; the
first release of any app failed at its own backup gate; a restore could
overwrite the dump it was restoring from; a live database was dropped before
the dump was validated; the sign-in rate limit was one global bucket; a
viewer could read every person's e-mail through the history endpoint.

All of these are fixed and each has a test or a stubbed scenario:

- Contract: `UserPage` in `shared/schemas.ts`, one `useUsers()` hook, the
  mock mirrors the server's order and paging.
- Auth and roles: forwarded-IP headers honoured with a forged-chain test;
  history gated to members with e-mails redacted; four role tests through a
  real magic-link cookie; sign-up closed; magic links only for known people.
- Jobs: an expired lease on the last attempt marks the job failed; a bad
  schedule row no longer stops claiming.
- Dates: one app time zone on the server; date-only values never pass
  through an instant; the weekly chart compares app-zone days.
- Screens: fetch errors show the server's sentence and request id instead of
  "0" or "No items"; the conflict check is live; unknown `/health/*` is a 404.
- Release: first release skips what does not exist; the live marker is written
  at the switch, not after verify; the rehearsal fails on an empty copy; one
  lock, per-commit names, SIGINT cleanup; no password on any command line;
  dumps are timestamped and never overwritten; restore validates before it
  drops.

**Still open, by decision:** attachments are readable by any signed-in viewer
of any entity (single-tenant, viewers read everything anyway); members may
delete any attachment (they may edit any record). Both are consistent with the
role model, and both are one line to tighten when an app needs it.

## 4. Code quality as a template

**Good.** Comments say why, names are plain, the vocabulary components have a
one-line index, every rule that a script can check is checked, and the tests
are oracle-style where paging and filtering are concerned (every filter × page
walk equals an in-memory reference).

**Fixed.** Three copies of one query, `Intl` in the translation layer, five
English strings in a shared component, an oracle that tested half the search,
a `test:postgres` script that silently tested PGlite, HSTS set in two places,
a stale claim in the decisions record ("migration idempotency check") replaced
by a real check (an applied migration that differs from `main` fails the
build).

**Left as is, on purpose.** The screens use a small typed fetch layer that
parses every response with the shared Zod schema rather than Hono's typed
client. The reviewer is right that the typed client would have caught the
`/api/users` mismatch at compile time; the runtime parse caught it at the
first real request instead, which is the trade the contract-first design
makes so the two halves can be built in parallel. Worth revisiting once the
API stabilises.

## 5. Best practice for agent-driven development

**Holds.** Facts in the always-loaded file, procedures in skills, folder rules
loaded on demand, hooks for what must always happen, subagents for noisy work,
worktrees per implementer, verification by command output and screenshots,
incidents with regression tests, a bounded status file. The kit was built the
way it tells others to build: five parallel implementers against a shared
contract, an adversarial fresh-context review, findings before fixes.

**Two lessons for the kit's own guidance.** First, "built in parallel against
a contract" needs one integration pass before anything is called done — every
one of the run-stopping defects lived at a seam between two agents' work.
Second, a stubbed test of an operational script is worth more than it looks:
the stub runs found the YAML health check that parsed as a mapping, two
`set -e` early exits, and stdin being swallowed by `docker compose exec`. Both
lessons belong in `docs/agent-development-model.md` when it is written.

## 6. The goal: predictable, reliable, faster, robust

- **Predictable** — decisions are written down and the stack is fixed; the
  agent cannot re-debate them and the checker refuses drift.
- **Reliable** — 145 tests, a real-Postgres CI job, a release with eight gates
  before the switch, a backup before anything changes, a restore that refuses
  before it destroys.
- **Faster** — the first screen exists within the hour; the vocabulary
  components and the paged list mean a list screen is composition, not
  invention; skills load only for the task at hand.
- **Robust** — the fences are scripts, the mistakes we already paid for are
  encoded as gates, and the health page says what is wrong in plain words.

**What is not yet proven, and must be before v1 is announced:** nothing in
`deploy/` has run on a real server. The image build, the Compose bring-up, the
first release and one restore have to be done once, on a rented machine, with
the guide open, by someone who then corrects the guide. That is the next
milestone, followed by the owner's pilot project.
