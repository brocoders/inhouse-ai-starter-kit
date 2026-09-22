---
name: plan-feature
description: Start a new feature or a change the owner cannot describe in one sentence — interview them, write a one-page spec, plan in small verifiable steps, then build in a fresh session.
---

# Plan a feature

1. **Interview.** Use AskUserQuestion. Ask about the people who will use it,
   the records involved, what "done" looks like on the phone, edge cases and
   what is out of scope. Do not ask what you can read from the code or
   `docs/product.md`. Stop when a colleague could build it from the answers.
2. **Spec.** Write `docs/specs/<feature>.md` from `docs/specs/TEMPLATE.md`:
   one page, plain language, the screens named, the data named, the
   acceptance checks as things a person can try. Show it and get a yes.
3. **Sketch when the screen is new.** A text wireframe or a quick rendered
   screenshot of the empty screen — whichever fits — before building.
4. **Plan.** Steps of two to five minutes each, with the file(s) touched and
   the command that proves the step. Anything touching auth, money, roles,
   migrations or locks is marked for the deep tier.
5. **Build in a fresh session** with the spec as the brief, so the
   interview's noise stays out of the builder's context. In `team`, open the
   pull request; in `solo`, follow `/release` when the checks are green.
6. **Close.** Update `docs/STATUS.md` and the feature list in
   `docs/product.md`; say what was not done.

Skip steps 1–4 when the diff fits in one sentence.
