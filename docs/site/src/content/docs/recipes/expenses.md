---
title: Expense approvals
description: A starting spec for submitting an expense, approving it, and being able to say where any claim got to.
sidebar:
  order: 3
---

A starting point. Change what is wrong for you and hand it to the agent as the
brief — see [how to use a recipe](./index.mdx).

**For whom:** an operations or finance lead in a company of ten to fifty
people, where expenses arrive as photographs in a chat and approval is whoever
answers first.
**Why now:** "Nobody can tell an employee when they will be paid back, and I
find out what we spent when the accountant asks."

## What a person can do

- Submit a claim from a phone, standing next to the taxi: amount, date, what it
  was for, a photograph of the receipt.
- See every claim they have submitted and exactly where it is.
- As an approver: see what is waiting, open one, and approve or send it back
  with a reason.
- As finance: mark a batch as paid, and download the month as a spreadsheet for
  the accountant.
- See what has been spent this month, by category and by person.

## Screens

- **Waiting on you** — the opening screen. For a submitter it is their claims in
  progress; for an approver it is the queue.
- **New claim** — one short form, the camera reachable in one tap, nothing
  optional that does not need to be.
- **A claim** — amount, date, category, the receipt large enough to read on a
  phone, and every step it has been through with who did it and when.
- **All claims** — a list filtered by status, person, month and category.
- **This month** — totals by category and by person, and the unpaid total.

## Records

- **Claim** — who, amount, currency, date spent, category, description, receipt
  file, status, which approver, when decided, reason if sent back, when paid.
- **Category** — a short fixed list to begin with: travel, meals, equipment,
  software, other.

## Rules

- Statuses are: submitted, approved, sent back, paid. A claim never skips a
  step, and its whole path is visible on its page.
- **Nobody approves their own claim**, including the owner.
- A claim sent back requires a reason, and the reason is shown to the person who
  submitted it.
- Money is entered and stored as whole units of the smallest denomination, so no
  rounding ever appears from nowhere.
- Once paid, a claim is not editable. A mistake after payment is a new claim
  with a negative amount, so the history stays true.
- A receipt is required above an amount you set once — a small cash claim does
  not need one.

## Done when

1. You submit a claim from a phone with a photographed receipt and it appears as
   submitted.
2. An approver sees it in **Waiting on you** the moment they open the app.
3. They send it back with a reason; the submitter sees the reason on the claim.
4. The submitter corrects and resubmits, and the whole path is still visible.
5. The approver approves it; the claim shows who approved it and when.
6. An approver tries to approve their own claim and the app refuses, saying why.
7. Finance marks three claims as paid and downloads the month as a spreadsheet
   that opens correctly.
8. A claim above the receipt threshold with no photograph cannot be submitted,
   and the message appears under the receipt field.

## Out of scope

Anything touching a bank or a payment. Mileage rates, per-diems and tax
treatment. More than one currency. Approval chains with more than one step and
delegation while somebody is away — both are worth doing later, after you have
watched a month of real claims. Reading amounts out of the receipt photograph is
a good second version and an easy way to get the first one wrong.
