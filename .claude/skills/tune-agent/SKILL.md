---
name: tune-agent
description: The owner corrected the agent for the second time about the same thing, or wants a rule, skill or hook changed — put the lesson in the one place it belongs without loosening a fence or bloating the always-loaded file.
---

# Changing how the agent works

Every rule has one home. Adding a second copy is how instructions start to
disagree. Decide the home first, then make the change, then prove it.

## Where a lesson goes

| The lesson is…                                     | Home                                                        | Why                                               |
| -------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| a preference or correction from the owner          | auto memory (one note, why + how to apply)                  | it is about this owner, not every project         |
| a fact every session needs                         | `AGENTS.md` (≤ 150 lines; `check-repo` refuses more)        | always loaded; facts only, never procedures       |
| a constraint that applies to one folder            | `.claude/rules/<area>.md` with `paths:`                     | loads only when those files are touched           |
| a procedure for one kind of task                   | `.claude/skills/<name>/SKILL.md` (≤ 80 lines)               | loads on demand; link a reference file for detail |
| something that must happen every time, no judgment | a hook in `.claude/hooks/` wired in `.claude/settings.json` | prose is a request; a hook is a fence             |
| a check a script can make                          | `scripts/check-repo.mjs` or `check-frontend.mjs` + a test   | zero tokens, same result every time               |

## How to change it safely

1. Read `docs/agents.md` — "What is enforced, and by what" — before touching a
   rule, so a fence is never replaced by a sentence.
2. Change one home. Grep for the old wording and remove duplicates rather than
   editing each copy.
3. A hook or checker change needs a test in `scripts/*.test.mjs` with a blocked
   case and an allowed case; feed the hook a sample stdin by hand as well.
4. A `settings.json` change is `ask`-gated on purpose; say what it widens or
   narrows. Never allow a bare `node *` or `bash *`.
5. Run `node scripts/check-repo.mjs` (budgets) and `node --test 'scripts/**/*.test.mjs'`.
6. Record the change in `docs/decisions.md` if it is a policy, or in the memory
   note if it is a preference. Report what changed in plain words.

Skip this skill for a one-off instruction the owner gives for today's task.
