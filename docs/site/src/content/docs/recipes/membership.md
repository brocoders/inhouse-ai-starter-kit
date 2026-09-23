---
title: Membership and dues
description: A starting spec for who is a member, until when, who has paid and who needs reminding.
sidebar:
  order: 5
---

A starting point. Change what is wrong for you and hand it to the agent as the
brief — see [how to use a recipe](./index.mdx).

**For whom:** whoever runs a club, a professional association, a co-working
space or a community of a few hundred people — usually one person, part-time,
with a spreadsheet and a payment app.
**Why now:** "I do not know how many paid members we have today, and chasing
dues takes an evening a month."

## What a person can do

- See, in one number, how many members are current today.
- Add a member: name, how to reach them, when they joined, which kind of
  membership.
- Record a payment against a member, which extends their membership to a date.
- See who lapses in the next thirty days, and who has already lapsed.
- Send a reminder to everyone in that list, and see that it went.
- Record attendance at an event, or a meeting, against members.
- Let a member see their own page: when they are paid until, and their history.

## Screens

- **Today** — current members, lapsing within thirty days, lapsed, and dues
  received this month.
- **Members** — a list filtered by state and kind, searchable by name.
- **A member** — contact details, which kind, paid until, and the whole history
  of payments and attendance.
- **Record a payment** — member, amount, date, method, and what period it covers;
  the "paid until" date is calculated and shown before saving.
- **Reminders** — who is about to lapse, what the message says, and a record of
  what was sent to whom and when.
- **Events** — a date, a name, and a list to tick people off against.

## Records

- **Member** — name, e-mail, phone, kind of membership, joined on, paid until,
  state, notes.
- **Membership kind** — name, how long a payment extends it, standard amount.
- **Payment** — member, amount, date received, method, period covered, note.
- **Event** — name, date, and who attended.
- **Reminder sent** — to whom, when, which message.

## Rules

- A member's state is worked out from **paid until** rather than being typed:
  current, lapsing soon, or lapsed. Nobody can set it by hand, so it can never
  disagree with the payments.
- A payment extends **paid until** from whichever is later — today, or the
  existing date — so a member who pays early does not lose the remainder.
- Amounts are whole units of the smallest denomination of one currency.
- A member is never deleted; they are marked as left, with the date, and their
  history stays.
- A reminder is recorded when it is sent, so nobody is chased twice in a week.

## Done when

1. You add a member and they appear as lapsed, because no payment exists yet.
2. You record a year's payment and their **paid until** moves a year out and
   they become current.
3. You record a second payment before that date expires and it extends rather
   than replaces.
4. A member whose date is twenty days away appears in **lapsing soon**.
5. You send the reminder list and each member's page shows that it was sent.
6. You tick eight people off at an event and each of their pages shows it.
7. A member signs in and sees their own page and nobody else's.

## Out of scope

Taking money — no card payments, no direct debits, no payment provider. You
record payments that happened somewhere else. Automatic recurring billing.
Public sign-up: members are added by you, which is what makes the list
trustworthy. Tiered voting rights, committees and roles beyond owner, member and
viewer. Sending a newsletter — the reminder is one message with one job.
