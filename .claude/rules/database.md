---
paths:
  - "server/src/db/**"
  - "server/drizzle/**"
---

# Schema and queries

A schema change is `pnpm db:generate`, a review of the generated SQL, then
`pnpm db:migrate`. Never edit a migration that has been applied anywhere;
write the next one. Every migration must be safe to run twice. Every table
gets the four tracking columns through `withTracking()`. Filter, sort and
cut the page in SQL — never fetch a table to filter it in code. Add the
index in the same migration as the query. Anything that can only run on
real PostgreSQL (casts, `SKIP LOCKED`, JSON operators) needs a test marked
`postgres` so CI runs it against the real thing; PGlite passing is not
proof.
