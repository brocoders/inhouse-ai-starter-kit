---
title: A KPI dashboard from imports
description: A starting spec for one picture of the numbers that matter, built from monthly exports out of the systems you already use.
sidebar:
  order: 6
---

A starting point. Change what is wrong for you and hand it to the agent as the
brief — see [how to use a recipe](./index.mdx).

**For whom:** a founder or managing director whose numbers live in four
places — the accounting package, the advertising account, the support tool, a
spreadsheet — and who currently rebuilds the same slide every month.
**Why now:** "It takes half a day to answer 'how are we doing', and by the time
I have the answer it is out of date."

## What a person can do

- Upload a file exported from another system — a spreadsheet or a CSV — and see
  what was read before anything is saved.
- Fix the handful of rows that did not fit, on the screen, without editing the
  file.
- Type a number by hand for the things no system exports.
- See each measure over time, against its target, with the change on last month.
- Open a measure and see exactly which upload each value came from.
- Replace a month that was wrong, and have the picture correct itself.

## Screens

- **The dashboard** — the opening screen: every measure as a single large
  number with its change and a small chart, grouped the way you actually think
  about the business. On a phone it is one column of cards.
- **A measure** — its own page: the full history as a chart and as a table, the
  target, the definition in one sentence, and where each value came from.
- **Import** — choose a source, drop the file, see a preview of what was read,
  what will be added, what will be replaced and what could not be understood.
- **Sources** — one page per source saying which columns it expects and when it
  was last uploaded, so a stale source is obvious.
- **Enter by hand** — a short form for the measures nobody exports.

## Records

- **Measure** — name, one-sentence definition, unit, whether higher is better,
  target, which source it comes from, how it is grouped on the dashboard.
- **Value** — measure, period (a month), the number, which import it came from,
  who entered it if by hand.
- **Source** — name, expected columns, last uploaded, who uploaded it.
- **Import** — file name, source, when, who, how many rows were read, added,
  replaced and rejected.

## Rules

- Every value belongs to **one measure and one month**. Uploading the same month
  twice replaces it rather than adding to it, and the previous values stay
  visible in that measure's history.
- An import is a two-step action: a preview, then a confirmation. Nothing is
  saved from the first step.
- A row that cannot be understood is listed with its line number and the reason,
  and the rest of the file still imports.
- Numbers are stored exactly as read; percentages and ratios are worked out for
  display and never stored as a rounded figure.
- A measure with no value for last month is shown as missing on the dashboard
  rather than silently showing the month before.

## Done when

1. You upload a real export from one of your systems and the preview shows the
   right number of rows before anything is saved.
2. A file with three bad rows imports the rest and lists those three with their
   line numbers.
3. The dashboard shows each measure with its latest value, its change and its
   target.
4. You upload the same month again with corrected numbers and the dashboard
   changes; the measure's page shows both imports.
5. You open a measure and can say which file each value came from.
6. A measure with nothing for last month is visibly marked as missing.
7. The dashboard is readable on a phone without sideways scrolling.

## Out of scope

Connecting directly to another system's interface — that is a different project
per system, and monthly exports answer the question at a tenth of the cost.
Forecasts, budgets and variance analysis. Measures built out of other measures.
Anything live or to the minute: this is a monthly picture, and pretending
otherwise is how a dashboard stops being trusted.
