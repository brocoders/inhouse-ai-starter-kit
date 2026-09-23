# InHouse AI Starter Kit

Build your company's own tools with AI.

InHouse is a starter kit for founders, leaders and managers who want a system
of their own for how their company, team or community works — instead of
spreadsheets, an expensive or ill-fitting SaaS, or a tool that almost does the
job. You describe what you need; an AI coding agent (Claude Code) builds it on
foundations that are already decided, tested and written down.

If you lead something and you are the one who ends up fixing the process, this
is for you.

## Who it is for

**The founder running the company from spreadsheets.** Orders, cash, clients
and commitments live in Google Sheets, a chat and their head. They want one
place that is always current, that the team updates from their phones, and
that tells them when something needs attention.

**The operations or finance leader replacing a tool that stops short.** An
outdated desktop program, an expensive SaaS used at ten percent, or a good
product that does not do the one thing their process needs. They want a few
roles — who enters, who approves, who only sees — a record of every change, and
a monthly figure they can trust.

**The leader of a team or professional community with its own way of
working.** Members, schedules, dues, attendance, decisions — a process no
product matches, run by people who know each other by name.

It works for personal systems too — a household, a side project — and the
first app built on these foundations was exactly that.

## What you build with it

A private web application that is the system of record for one part of your
business or life. Every app made from this kit:

- works on the phone first and on the desktop as well, and installs on the
  home screen like a native app;
- sits behind a login, for people you know by name, with owner, member and
  viewer roles;
- keeps history: every record shows who changed what and when;
- stays fast with thousands of rows, and a link shows a colleague exactly what
  you see;
- runs scheduled jobs and sends notifications — reminders, digests, alerts;
- starts from your existing data and gets it out again when you need it;
- can be helped by an AI — sorting, suggesting, drafting, answering questions
  about your data — on a fixed monthly budget, with the results always
  visible and editable by a person;
- runs on one rented server, is released with one command, and is backed up
  every night;
- comes with basic security on: HTTPS only, login limits, expiring sessions.

Kinds of apps it fits best: a small CRM or pipeline; a ledger, cash-flow or
budget tracker; expense or leave approvals; inventory, equipment or asset
registers; membership and dues; attendance and shifts; a task tracker shaped
to your team; a KPI dashboard fed from other systems.

## How working with it feels

1. You describe what you want. The AI interviews you and writes a one-page
   spec you approve.
2. It plans, builds, tests, and shows you how it will look — a sketch, a
   wireframe or a screenshot, whichever fits the step.
3. You try it on your phone and say what to change.
4. One command releases it to your server. Every release, decision and
   incident is written down in the project, in words you can read.
5. Months later, you or a colleague open a new conversation and the AI already
   knows the project: what it does, what was decided, what went wrong before.

## Why not a blank Claude Code

A blank Claude Code is a brilliant builder with no memory of what works. This
kit is the memory: decisions already made, mistakes already paid for. Login,
roles, history, fast lists, jobs, notifications, release and backups exist on
day one, so your first conversation is about your process, not about plumbing.
The AI works inside guard-rails enforced by scripts, not by hoping it
remembers. And everything it does is written down for a leader to read.

## Status

Version 0.1 — built and checked, not yet released to anyone. `pnpm check`
passes (145 tests, the design checker, the bundle budget); the app has been
run end to end on a laptop with invented data, at phone and desktop widths. The server path
(Docker Compose, the one-command release, backups) is written and tested
against stubs but has **not yet run on a real server** — the first real
release is the next milestone. Decisions taken so far are in
[docs/decisions.md](docs/decisions.md); the guides are in `docs/site`.

---

Made by [Brocoders](https://brocoders.com). When your system outgrows you, we
help. This line is yours to remove.
