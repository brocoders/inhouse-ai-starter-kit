# Version 0.3 — what every app needed

**For whom:** the creator of an app built on this kit, in the week their app
becomes real: it moves onto a server that already runs something else, it has
data worth copying off the machine, it has a job that must run every few
minutes, and its screens outgrow a five-tab bar.
**Why now:** three projects built each of these themselves, twice, differently
(`docs/reviews/2026-10-21-feedback-review.md`, section 4). The kit left them
as "recipes" that did not exist.

## What changes, in the order it ships

Nine steps, each its own commit with tests, `node --run check` green, and
`docs/STATUS.md` plus the relevant doc updated in the same change. The order
is the one the review ranked by how many projects needed the thing; it stays
unchanged. Steps 1 and 6 touch `deploy/`, which is ask-first: the exact change
is named here so the yes below covers it. Step 5 uses step 2.

### 1. A server that already hosts another app

`server-setup.sh` gains a `--shared` mode. Today it assumes a fresh Ubuntu and
hardens the whole machine. In shared mode it touches only what is this app's:

- the folder must be given explicitly (no `/opt/<app>` default) and
  `deploy.dir` must say the same; the slug is the app name as today, and the
  script refuses a slug whose containers or volumes already exist under
  another folder;
- SSH hardening, the firewall, unattended upgrades, fail2ban and the Docker
  install are **checked and reported, never changed** ("Docker 27 present",
  "firewall active — not touched"); the `deploy` user is reused if present;
- it creates the app's folder, backup folder, `.env`, backup wrapper and timer
  as today, all already named by the slug.

Ports: a shared server usually already has something on 80 and 443. The script
checks and says so. For that case `inhouse.config.json` gets
`deploy.edge: "own" | "host"` (default `own`, today's behaviour). With `host`,
the kit's Caddy is not started (a Compose profile on the `caddy` service, and
the release skips its Caddy step) and the app publishes `127.0.0.1:<port>`
only, with the port in the server's `.env` as `APP_BIND_PORT`; the owner adds
one block to the server's own reverse proxy, which the script prints. This is
the path Keepard took behind a shared Caddy. If you would rather keep 0.3 to
the folder and slug, say so and `deploy.edge` moves to 0.4.

Done when: the setup script's own tests (stubbed commands) show shared mode
creating the app's files and touching nothing else; `docs/server-requirements.md`
and the publishing guide describe the shared path in one short section.

### 2. Jobs every N minutes

`schedule(name, { everyMinutes: 15 })` beside `{ daily: '07:00' }`. The first
run is lined up N minutes after the schedule is first seen, never at once; a
run writes the next one from `now`, so a server off for an hour runs once
when it returns. Whole minutes from 1 to 1440; anything else is refused with
the same kind of plain message as a bad time of day. The health page's "due
more than two hours ago" warning applies unchanged.

Done when: tests cover lining up, running once, not twice on the next tick,
downtime, and a changed interval; `docs/product.md`'s schedule section shows
the second form.

### 3. The phone tab bar with "More"

With up to five visible screens the bar is as today. With more, the first
four are tabs and the fifth is **More**, which opens a bottom sheet listing
every remaining screen; More is highlighted when the current screen is in it.
Which screens come first is the order of the list in `navigation.ts`, so an
app chooses by reordering one line. The desktop sidebar does not change.

Done when: a unit test on the split (five screens → five tabs; six → four plus
More holding two); phone screenshots with the worked example plus two extra
screens; `frontend/DESIGN.md`'s Phone section says how the bar behaves.

### 4. Touch targets, confirmations and history that reads

Against `frontend/DESIGN.md`'s own rule (rows at least 44 px on the phone):

- every row, control and icon button in `components/inhouse/` and the shell
  meets 44 px on the phone; the frontend checker gains a rule for the
  primitives' row classes so the next primitive cannot regress;
- the irreversible actions in the kit's own screens get `ConfirmDialog`:
  changing somebody's role and turning them off (people), and the destructive
  actions on an item. Nothing reversible gets one;
- **one home for the history vocabulary**: the list of actions lives once in
  `shared/` and the schema, the server's audit code and `HistoryList` all read
  it, so adding an action is one entry plus one dictionary line. `HistoryList`
  writes an object value as its `name`, `title` or `label` when it has one and
  as a short key list otherwise, never `[object Object]`; UUID-shaped values
  are written as "another record".

Done when: a test on the value rendering; screenshots of people and an item
on the phone; the checker's new rule has a test.

### 5. `notify()` as an outbox, and problems that reach the owner

`notify()` still sends at once. What changes is what happens when it cannot:
the row keeps the address and the text, and the worker retries it with the
same doubling wait as a job, five times, before the health page counts it as
failed. A message may carry a **key**; while an unresolved row with that key
exists, a second `notify()` with it is written down as skipped, not sent.
`resolveNotice(key)` closes it, so the next occurrence is told again.

The health page's problems reach the owner once each: a job every fifteen
minutes (step 2) reads the same problem list the page shows, and a problem
seen on two consecutive runs is sent to every active owner with the key
`health:<code>`; when it disappears the key is resolved. Nothing is sent in
the first run after a start, so a restart does not cry wolf.

Records: `notifications` gains `address`, `text`, `html`, `key`, `attempts`,
`next_attempt_at`, `resolved_at`; one migration, safe to run twice; deep tier.

Done when: tests cover a failed send retried and then sent, five failures
giving up, a keyed message skipped and then sent again after resolving, and
the owner told once about a persisting problem and not about a passing one.

### 6. Off-site backups: restic to an S3-compatible bucket

One recipe, built in. **restic**, not `age` plus an upload tool: one binary
does encryption, upload, retention and restore, it is in Ubuntu's own
repository, and it works with any S3-compatible bucket (Hetzner Object
Storage, Backblaze B2's S3 endpoint, AWS), so the choice of provider stays
the owner's. The dump is still taken exactly as today; when
`/opt/<app>/.backup.env` exists (mode 600, written by the owner by hand from
the guide, holding the bucket, the two S3 keys and the restic password),
`backup.sh` also sends the new dump and the server's `.env` to the bucket and
keeps 14 daily, 8 weekly and 6 monthly copies. It writes a dot-file marker in
the backup folder, and the health page warns when off-site is set up and the
newest off-site copy is more than two days old. The file is never read by the
agent; the guide says what to put in it and that a key shown once is a key
rotated.

Done when: `backup.sh` is exercised against a stubbed `restic` (arguments
recorded, off-site skipped when the file is absent); `docs/backups.md` has
the set-up, the proving restore and the "what it costs" line; `restic` is in
`docs/server-requirements.md`; `server-setup.sh` installs it.

### 7. The first-screen budget: a reasoned change, not a split

The kit's first paint is 164 KB of a 200 KB budget with one eager dictionary
of 205 lines, which is about 3 KB compressed; routes are already split
(`autoCodeSplitting`). A lazy per-area dictionary with a static check that
every key a chunk uses is loaded would save a few kilobytes and add a
mechanism every screen must get right. Instead: the budget is split into the
**shell** (what loads before sign-in: 170 KB) and any **one screen** on top
(60 KB), measured from the built chunks, and the checker names the screen
that is over. That is where the platform's day-three ceiling actually came
from: one heavy screen, not the words. Translations stay one file.

Done when: `check-frontend.mjs` reports both numbers and fails on either;
its test covers both; `frontend/DESIGN.md` states the two budgets.

### 8. CI that works on a private repository, and a no-CI mode

- The "fetch main" step authenticates with the workflow's own token, so it
  works on a private repository with credentials not persisted.
- Sorting in the checkers passes a fixed locale, so CI and a laptop agree.
- The docs workflow always builds the site and deploys only when the
  repository variable `PUBLISH_DOCS` is `true`, since Pages from a private
  repository needs a paid plan; without the variable the run is green.
- **No-CI mode**: the repository variable `INHOUSE_CI` set to `off` skips the
  test workflow's job; the gate is then `pnpm check` on the laptop, which the
  release skill already runs. `docs/running.md` documents both variables
  and the self-hosted runner as the middle option.
- A private npm package at build time is documented in the same page:
  registry line in `.npmrc`, token in `~/.npmrc` and as the `NPM_TOKEN`
  secret, passed to `pnpm install` in both workflows (harmless when unset).
  The Docker build secret is described, not added: it is a `deploy/` change
  for the app that needs it.

Done when: both workflows green on this repository; `docs/running.md` has the
section; the sort fix has a test with a locale that orders differently.

### 9. Where an app records its departures from the kit

`docs/product.md` gets a section **Where this app departs from the kit**: one
line per override, the rule it overrides and why, with the example "Reports:
desktop first — a 30-column table is read at a desk." The frontend rule and
`DESIGN.md`'s Phone section say to look there before treating a screen as
phone-first; `AGENTS.md` keeps its line count by folding the pointer into the
sentence that already names `docs/product.md`.

Done when: a screenshot-free doc change; `check-repo.mjs` still green on the
line budgets.

## Out of scope

Multi-tenancy, Telegram, revisions with restore, a Next.js variant,
credential-expiry ladders, container hardening, a per-area translation split,
a second notification channel. The Drizzle subquery trap shipped in 0.2.

## Close

The review's section 4 table gets a column saying what 0.3 shipped for each
row; `docs/decisions.md` gets one entry per choice above (shared edge,
restic, the two budgets, the outbox's send-first shape, the no-CI variable);
`docs/STATUS.md` says what is left.
