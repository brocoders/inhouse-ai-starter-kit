---
name: verify
description: Before saying a change is done — run the proof, look at the screens, audit every claim against a tool result from this session.
---

# Prove it

- Run `pnpm test` for the inner loop; `pnpm check` once before a pull
  request. Paste the relevant lines of output, not "passes".
- Visual work: `pnpm shots /route` (add `SHOTS_DARK=1` when tokens changed),
  open both PNGs, fix what is obviously wrong before showing the owner.
- A changed or deleted existing test needs a sentence on why the old
  assertion was wrong.
- A check must be able to fail. `pnpm check | tail` reports tail's exit
  code and never fails; run it to a file and read `$?`. A comparison that
  reports "identical" over two empty results has proved nothing.
- Report in three parts: what changed for the owner, what was verified and
  how, what is not done or not verified. No labels from the plan; plain
  words.
