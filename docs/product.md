# What this app is

_The `/setup` skill fills this page in from your answers. Keep it current: every
session reads it, and when a fact here is stale the agent builds on the wrong
picture. One screen, plain words._

## In one sentence

What this system is the record of, and for whom. Example: "Where our sales team
keeps every quote and its status, replacing the shared spreadsheet."

## Who uses it

| Role   | Who they are | What they do here                                      |
| ------ | ------------ | ------------------------------------------------------ |
| Owner  |              | invites people, changes settings, sees the health page |
| Member |              | enters and edits records                               |
| Viewer |              | reads                                                  |

## The records

The nouns of the system and one line each. Start with the ones that exist.

- **Items** — the worked example that ships with the kit. Replace or delete it
  once your first real record exists.

## What happens on a schedule

Jobs and reminders, with their time in the app's time zone. A job runs
either daily at a time or every so many minutes; nothing finer.

- Daily 07:00 — assignees receive a list of their overdue items (example).
- Every 15 minutes — the health page is read and a problem that has stayed
  is e-mailed to every owner, once (built in; `health.watch`).

## Words we use

Terms the people in this business use, so the screens use the same ones.

## Not in scope

What this system deliberately does not do, so nobody builds it by accident.

## Where this app departs from the kit

One line per override: the screen or area, the kit rule it sets aside, and
why. Every session reads this page, so a departure written here holds; one
written in a spec or a handover is forgotten by the next session. The rules
themselves stay as they are in `AGENTS.md`, `frontend/DESIGN.md` and
`.claude/rules/`; this is the list of exceptions.

- Reports: desktop first, not phone first — a thirty-column table is read at
  a desk, and the phone gets a summary card instead (example).
