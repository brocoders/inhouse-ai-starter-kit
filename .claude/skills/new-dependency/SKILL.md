---
name: new-dependency
description: Decide whether to add a library, and add it properly if so. Use before any pnpm add — a dependency is a decision the owner lives with, not a detail.
---

# Adding a dependency

Every package is something that has to be updated, audited, and understood by
whoever reads this code next. The default is no.

## Decide, in this order

1. **Does something already installed do it?** Read `docs/stack.md` first. Zod
   validates, date-fns handles dates, Drizzle queries, TanStack Query caches
   and retries, Hono routes. Most "we need a library" moments are a function in
   one of these that nobody looked for.
2. **Is it a UI component?** Then it is not a dependency — search the registry:
   `pnpm exec shadcn search "<term>"`, `view` it, `add` it. That copies source
   into `components/ui/`, which we own and never edit by hand.
3. **Would you write under about a hundred lines?** Then write it. The
   pull-to-refresh gesture is the worked example: every package for it brings a
   scroll-position model and its own styling, and the version in this kit is
   sixty lines of touch handlers that does exactly what the design asks.
4. **One library per job.** If something here already does most of it, extend
   that rather than adding a second mechanism beside it. Two libraries doing
   one job is how a stack stops being explainable.
5. **Ask the owner** when the package does what an existing one does, costs
   money, needs an account, or touches authentication, payment or data
   storage. `AGENTS.md` lists that as ask-first, and it means before installing.

## Add it properly

- `pnpm add <name>` — or `pnpm add -D` when it never runs in production.
- **Pin exactly** — no `^` — for anything touching authentication or sessions.
  Better Auth is pinned for this reason: a minor release broke sign-in once.
- Check the last release date and the open issues before installing. A package
  quiet for a year is a package you are adopting.
- Add a row to `docs/stack.md`: the version, why this one, and what to watch
  out for. A choice with no reason written down gets re-litigated every month.
- `pnpm check` — the frontend budget will tell you immediately if the package
  landed in the first paint when it should have been lazy.

Report it to the owner as what it lets the app do, plus anything it costs.
