---
name: list-screen
description: Add a list of records people can search, filter, sort and page through — the endpoint, the screen and the URL state, with the filtering done in SQL.
---

# A list of records

The one rule everything else follows from: **the database does the filtering,
the sorting and the cutting.** Fetching a table and filtering it in JavaScript
works perfectly on the seed data and falls over the month the table is real.
It is the mistake this kit exists to prevent.

## The endpoint

1. One Zod schema for the query: the filters, the sort, a `limit`, and a
   `cursor`. Validate it at the boundary; everything downstream is typed.
2. Build one Drizzle query with the filters as `where` conditions. Sort by the
   columns the screen offers, always ending with the primary key so the order
   is total.
3. Page with a **keyset cursor**, not `offset`: `where (sorted_col, id) < (:last_col, :last_id)`.
   Offset re-reads everything it skips, and a row inserted while someone
   is reading shifts every page after it.
4. Return `{ rows, nextCursor }`. `nextCursor` is null on the last page.
5. **Enrich the page, never the table.** Names, totals and related records are
   looked up for the twenty rows you are returning.
6. Add the index for this query in the same migration — see `db-change`.
7. A count is a second query and usually not worth it. "More" is enough; an
   exact total of a filtered list costs a full scan.

## The screen

1. `PagedList` from `components/inhouse/` holds the paging, the empty state,
   the loading state and the virtualised rows. Do not re-implement any of them.
2. **Filters live in the URL**, through the router's search params. A filtered
   list is then a link the owner can send someone, a bookmark, and something
   that survives a reload. Local state loses all three.
3. Under 640 px the rows become cards — the `PagedList` row renderer handles
   both widths.
4. Debounce a text filter; every other filter applies immediately.

## Prove it

`pnpm test` for the endpoint, including the second page and the empty result.
`pnpm shots /route` for the screen, and look at the phone PNG: an empty list
and a long list both have to read well.
