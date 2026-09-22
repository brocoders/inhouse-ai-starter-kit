---
name: db-change
description: Change the database — a new table, a column, an index. Edit the schema, generate the migration, read the SQL before applying it, and keep it safe to run twice.
---

# Changing the schema

The schema lives in TypeScript under `server/src/db/`. The SQL in
`server/drizzle/` is generated from it. You change the first and review the
second; you never write the second by hand.

1. **Edit the schema.** Every table gets the four tracking columns through
   `withTracking()` — created and updated, at and by. Anything people care
   about also writes an `audit_log` entry when it changes.
2. **Generate.** `pnpm db:generate`.
3. **Read the SQL it wrote.** This is the step that is worth the time. Check
   that it does what you meant, then make every statement safe to run twice —
   each `create`, `alter` and `drop` gets its `if exists` or `if not exists`.
   A migration that fails halfway through a release leaves the database between
   two states, and the only way out of that is a migration that can be re-run.
4. **Ship the index with the query.** If this change adds a list, a filter or a
   sort, the index it needs goes in this migration, not a later one. An index
   added afterwards is an index nobody adds.
5. **Apply it.** `pnpm db:migrate`. Then `pnpm test`.
6. **Test what only real PostgreSQL can answer.** Casts, `SKIP LOCKED`, JSON
   operators, collation, `generated always as`: the local database is PGlite,
   which embeds a different PostgreSQL and has one connection. Anything in that
   list needs a test marked `postgres`, which CI runs against the real server —
   `pnpm test:postgres` runs it here.

**Never edit a migration that has already been applied anywhere.** The file and
the database would disagree from then on, silently and for good. Write the next
migration instead; a hook refuses the edit.

Dropping a column or a table destroys data. Say so to the owner and get a yes
before generating it, and say in the same sentence what is lost.

Report the change as what the app can now record or answer, not as DDL.
