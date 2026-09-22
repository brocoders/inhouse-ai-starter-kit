# The stack, and why each piece

Fixed choices so that no session re-debates them. Versions were verified
against the registries and release pages on **22 September 2026**; re-verify
the "last verified" date when bumping. Where a choice has a known risk, it is
written next to it.

## Runtime

| Piece | Version | Why | Watch out |
| --- | --- | --- | --- |
| Node | 24 LTS (`.nvmrc`) | Active LTS until Oct 2026, maintained to Apr 2028. | Node 26 becomes LTS on 28 Oct 2026; move deliberately, not by accident. |
| pnpm | 11 | Frozen lockfile, fast, one store across worktrees. | |
| TypeScript | 5.9 / strict | Types are the documentation an agent cannot ignore. | |

## Server

| Piece | Version | Why | Watch out |
| --- | --- | --- | --- |
| Hono + `@hono/node-server` | 4.13.8 / 2.1.1 | Web-standard request/response, small, and a typed client (`hono/client`) so the SPA calls the API without hand-written glue — less for the agent to write and get wrong. | Pin ≥4.13.8 (security fixes in 4.13.5 and 4.13.7). Routes must be chained for the client types; split into sub-apps as they grow. |
| `@hono/zod-validator` + Zod 4 | 0.9.1 / 4.6.x | Validation at every boundary, one schema library everywhere. | |
| Drizzle ORM + drizzle-kit | 0.45.3 / 0.31.11 | Schema in TypeScript, generated SQL migrations, queries that read like SQL so filtering stays in the database. | 1.0 is still RC after five months and the official docs' install lines say `@rc`; do not copy them. Avoid the v1-removed relational query API. |
| `pg` | 8.23 | The maintained node-postgres driver; the migrator examples target it. | `postgres.js` has been quiet since April 2025 — not used. |
| PostgreSQL | 16 | Boring, everywhere, one container. | PGlite embeds Postgres 17, so one CI job runs the real 16. |
| `@electric-sql/pglite` | 0.5.8 | In-process Postgres for unit tests: no service to start. | Single connection: cannot test `SKIP LOCKED` contention. Not proof of Postgres compatibility. |
| Better Auth | 1.7.5, exact pin | E-mail + password and magic link, sessions, rate limiting built in, Drizzle adapter, models know it. | Fast-moving: 1.7.0 broke things and 1.7.3 reverted part of it. Read the upgrade guide on every minor; never use 1.7.0–1.7.2. Cookies are same-origin: the API is served under `/api` on the app's own host. Roles are a `role` column plus our own middleware; the organization plugin is multi-tenancy and is not used. |
| Own jobs table | — | About eighty lines in our own migrations, testable in PGlite: claim with `FOR UPDATE SKIP LOCKED`, lease, heartbeat, retry. | `pg-boss` 12.x is the packaged alternative when cron + retries + dead letters are needed; it brings ten tables of its own. |
| pino | 10.3 | JSON logs; a child logger per request carries the request id from Hono's `requestId()` middleware. | `hono-pino` is in maintenance mode — not used. |
| Resend | SDK 6.28 | One API key, 3,000 e-mails a month free, no SMTP. | Returns `{ data, error }` instead of throwing — always read `error`. Sending from your own domain needs the DNS records in the publishing guide. |

## Frontend

_Filled in from the frontend research pass._

## Tooling and operations

_Filled in from the operations research pass._

## Not chosen, and why

- **TanStack Start** — still a release candidate. A Vite SPA with TanStack Router covers every app this kit targets.
- **Fastify** — mature, but no typed client without code generation; more glue.
- **Prisma / Kysely** — Drizzle's SQL-shaped queries keep filtering in the database, which is the lesson this kit protects.
- **Redis** — a jobs table in Postgres does the work for these apps.
- **Sentry, S3, Slack, Telegram, SMTP** — recipes, not defaults; each is another account for the creator.
