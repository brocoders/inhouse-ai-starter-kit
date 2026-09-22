---
name: incident
description: Something broke in production or data went wrong — investigate on a copy, write the incident record from the template, and end with a regression test.
---

# An incident

1. Say what the owner sees, in one sentence, and whether data changed.
2. Investigate on a copy: `pnpm db:copy`, then reproduce locally. For a
   live question use the `readonly` role over the tunnel. Never write to
   production outside the app or a migration.
3. Probe from several angles before blaming an outside service; one
   negative result is not a diagnosis.
4. Fix the cause, not the symptom. A cleanup command handed to the owner is
   not a fix.
5. Write `docs/incidents/YYYY-MM-DD-<slug>.md` from the template. Add the
   regression test in the same change. If the cause was "this only fails on
   real PostgreSQL", the test is marked `postgres`.
6. Release per `/release`; record it in `docs/STATUS.md`.
