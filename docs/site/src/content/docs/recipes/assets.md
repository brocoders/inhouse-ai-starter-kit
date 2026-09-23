---
title: Inventory and assets
description: A starting spec for a register of what you own, where it is, who has it and when it is due back.
sidebar:
  order: 4
---

A starting point. Change what is wrong for you and hand it to the agent as the
brief — see [how to use a recipe](./index.mdx).

**For whom:** whoever ends up answering "where is the good camera?" — an office
manager, a production lead, a workshop or a volunteer organisation with kit that
moves between people.
**Why now:** "We buy things twice because nobody can tell whether we already
have one, and things go out on loan and quietly do not come back."

## What a person can do

- Look something up on a phone while standing in the store room.
- Register a new item: what it is, its serial or tag number, where it lives,
  what it cost and when it was bought.
- Take an item out to a person or a place, with a date it is due back.
- Bring it back, and note its condition in one tap.
- See everything currently out, and everything overdue.
- Mark something as lost, broken, or retired, with a line saying what happened.
- Do a count: walk the shelves and tick off what is there.

## Screens

- **Out now** — the opening screen: what is out, with whom, and what is overdue
  at the top in a colour that means attention.
- **Everything** — a list filtered by category, location and state, searchable
  by name and by tag number.
- **An item** — its own page: what it is, where it should be, who has it now,
  and its whole history of movements and condition notes.
- **Take out / bring back** — a two-field action reachable in one tap from an
  item, designed to be used one-handed.
- **Count** — a checklist for one location, showing what should be there, what
  was ticked, and what is unaccounted for at the end.

## Records

- **Item** — name, category, tag or serial number, home location, state (in,
  out, lost, broken, retired), purchase date, purchase cost, notes, photo.
- **Movement** — item, out or back, who has it, which location, when, due back,
  condition on return, note.
- **Location** — name and a line saying where it is, so a new person can find it.
- **Count** — when, which location, who did it, and what was missing.

## Rules

- An item is either in, out, or in one of the ended states. It cannot be out to
  two people.
- Taking an item out requires a person and a due date; the due date defaults to
  a week and can be changed.
- "Overdue" is any item out past its due date, counted in your own time zone.
- Marking something lost or broken requires a line saying what happened, and the
  item stays in the register with its history rather than disappearing.
- Tag numbers are unique, and the app says so plainly when one is typed twice.

## Done when

1. You search a tag number on a phone and reach the item's page in one step.
2. You take an item out to a colleague, due Friday, and it appears on **Out
   now**.
3. On Saturday it appears as overdue.
4. You bring it back marked "scratched" and both the return and the note are on
   its history.
5. You try to take out an item that is already out, and the app refuses, saying
   who has it.
6. You run a count of one location, tick eight of ten items, and the result names
   the two that are unaccounted for.
7. You add an item with a tag number that already exists and the form refuses
   under the field.

## Out of scope

Barcode and QR scanning — a genuinely good second version, and it changes the
take-out screen rather than the records, so it is cheap to add later.
Depreciation and book value. Maintenance schedules and service records.
Consumables that are counted rather than tracked individually; that is a
different shape and deserves its own conversation. Purchase orders and
suppliers.
