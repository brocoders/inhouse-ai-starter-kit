---
name: release
description: Put a change on the server. Runs the gated release script, checks the profile first, and records what shipped. Ask for this by name — it is never started on its own.
disable-model-invocation: true
---

# Releasing

This one is asked for, never decided. It changes what other people are using.

## Before anything

1. **Check the profile** in `inhouse.config.json`.
   - `team` — stop here. Open the pull request, say it is ready, and let
     someone merge it. You do not release in this profile.
   - `solo` — you carry on, and you finish the whole job. Merge your own
     branch only once CI is green on that commit, with a plain merge:
     `gh pr merge --auto` merges at once on a repository with no required
     checks, and has.
2. `pnpm check`. Everything CI runs, once. If it fails, that is the work now;
   there is no releasing past a red check.
3. Look at the diff that is about to ship: `git log --oneline origin/main..`.
   If it contains something you cannot describe to the owner in a sentence,
   find out what it is first.
4. A migration in this release? Say so to the owner before you start, in one
   sentence about what changes for them, and say whether anything is lost.

## Release

`pnpm release <sha>` — the full commit sha of what you are shipping.

The script holds the gates and runs them in this order: a refusal if the sha
is not on `main` or is older than what is already running, the build on the
server, a backup, a rehearsal of the migrations against a restored copy of the
live database, the migration, the switch, a check that the new version
answers, and a prune of what is no longer needed. **It does not run the
tests** — `pnpm check` above is the test gate, and skipping it ships untested
code. **Do not run any of those steps by hand on the server.** Hand-running a
step is how a release ends up half-applied with no record of which half.

Four or five minutes is usual; the first release and one after a dependency
change take longer because the image builds from scratch. The pause of a few
minutes at the switch is normal. If the laptop briefly loses its route to the
server the script stops before the lock; run it again.

If a gate refuses, read what it said and fix the cause. Do not pass a flag to
get past it.

## After

1. Look at the change where it lives. A screen: open the app on the phone,
   from the home screen, and confirm the update prompt and the change. A
   change with no screen — a job, a webhook, an e-mail — proves nothing on a
   phone: read the health page, the log line it should have written, or probe
   it from outside with `curl`, and say which.
2. Add an entry to `docs/STATUS.md`: the date, the release sha, what changed
   for the owner in plain words, and anything to watch.
3. Tell the owner what shipped and what to look at. Not the sha — what is
   different for them.
4. Ask the owner one question: did anything in the kit get in the way since
   the last release? Write the answer as a dated line in
   `docs/kit-feedback.md`. The kit is updated from that file.

If something is wrong afterwards, that is the `incident` skill, and it starts
with a copy of the data, not with the server.
