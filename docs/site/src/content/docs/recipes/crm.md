---
title: A small CRM
description: A starting spec for clients, the conversations with them, and the deals that have gone quiet.
sidebar:
  order: 2
---

A starting point. Change what is wrong for you and hand it to the agent as the
brief — see [how to use a recipe](./index.mdx).

**For whom:** a founder or sales lead with a handful of sales people, who
currently keeps clients in a spreadsheet and the state of each deal in their
head or in a chat thread.
**Why now:** "I cannot tell which deals have gone quiet until somebody tells me
we lost one."

## What a person can do

- Add a company and the people at it, with how to reach them.
- Record a deal: what it is for, roughly how much, which stage it is at, who
  owns it.
- Move a deal to the next stage, and say in a line what happened.
- Log a conversation — a call, a meeting, an e-mail — against a company or a
  deal, in ten seconds, from a phone, on the way out of the meeting.
- See every deal that has had nothing logged against it for two weeks.
- See what each person is carrying, and what closed this month.

## Screens

- **Today** — the opening screen: deals gone quiet, deals expected to close this
  month, and anything assigned to you.
- **Deals** — a list, filtered by stage, owner and how long since it moved.
  Filters live in the address so a filtered view can be sent to somebody.
- **A deal** — its own page: the company, the people, the amount, the stage, and
  the conversation history under it, newest first.
- **Companies** — a list, and a page per company holding its people and every
  deal it has ever had.
- **Log a conversation** — reachable in one tap from a deal or a company; a
  date, a kind, and a box for what was said.

## Records

- **Company** — name, how they found you, country, notes.
- **Person** — name, role, e-mail, phone, which company.
- **Deal** — title, company, owner, amount, currency, stage, expected close
  date, why it was won or lost.
- **Conversation** — when, kind, who was there, what was said, which deal or
  company.

Stages are a short fixed list to begin with — new, talking, proposal sent,
won, lost — because a stage list you can edit is a second feature and rarely the
one that matters first.

## Rules

- Everyone in the team sees every deal; only an owner can delete one.
- A deal moved to won or lost asks for one line saying why, and it is required.
- "Gone quiet" means no conversation logged for fourteen days, counted in your
  own time zone.
- Amounts are entered in whole units of one currency, chosen once for the whole
  system.

## Done when

1. You add a company from your phone in under a minute, and it appears in the
   list.
2. You create a deal on it, move it to "proposal sent", and the change is
   visible with your name and the time against it.
3. You log a conversation and it appears at the top of the deal's history.
4. You set a deal's last conversation to three weeks ago and it appears in
   **gone quiet** on the Today screen.
5. You filter the deals list to one owner and one stage, send the address to a
   colleague, and they see the same list.
6. You mark a deal won without giving a reason and the form refuses, saying so
   under the field.

## Out of scope

E-mail integration of any kind — no reading your inbox, no sending from the
app. Forecasting and weighted pipeline values. Custom stages and custom fields.
Quotes, invoices and documents. More than one currency. Importing your existing
spreadsheet is a separate conversation and a separate afternoon.
