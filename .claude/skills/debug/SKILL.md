---
name: debug
description: Work out why something behaves wrongly — reproduce it on a copy of the real data, read the logs, and probe from more than one angle before naming a cause.
---

# Finding out why

## Reproduce it first

A bug you cannot reproduce is a guess you are about to ship.

1. `pnpm db:copy` brings the live database down to your machine. Add
   `--anonymize` if you are going to show anyone a screenshot.
2. `pnpm dev`, then do the thing the owner did, in the same order, as the same
   kind of user. Most "cannot reproduce" is a different role or an empty table.
3. Still not reproducing? That is information: the difference between here and
   there is the bug. Version, data, time zone, role, a job that has not run.

**Never write to production to investigate.** No `update`, no fix-up script, no
"just this one row". A hook refuses a database command pointed at the server.

## Read what was recorded

- The logs are JSON, one line per request or job, carrying the request id, the
  job id and the release version. Find the request id from the time and the
  person, then follow that id through every line it appears in.
- The health page lists the last day's errors, grouped. Start there when the
  owner says "it has been odd since yesterday".
- A live question a copy genuinely cannot answer — is this row like that _right
  now_ — is asked with the `readonly` database role over the SSH tunnel. It
  cannot write, which is the point.

## Probe from several angles

One negative result is not a diagnosis, and the outside service is rarely the
cause. Before you blame anything:

- Reproduce it at a different size: one row, no rows, many.
- Check the boundary you did not check: the time zone at midnight, a number
  that is zero, a name with an apostrophe, a second request arriving first.
- Look at what changed. `git log` around the day it started beats theory.
- If two attempts fail the same way, stop and re-diagnose. The third variation
  of a wrong idea is still wrong.

## Finish it

Fix the cause. A cleanup command handed to the owner is not a fix. Add the test
that would have caught it — marked `postgres` if it only fails on the real
database. If it reached people, the `incident` skill writes it down.

Report what happened as behaviour: what the owner saw, why, and what now stops
it happening again.
