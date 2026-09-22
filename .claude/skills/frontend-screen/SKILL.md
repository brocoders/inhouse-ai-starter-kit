---
name: frontend-screen
description: Build or change a screen — read the design system and the component vocabulary, compose from them, then prove it with screenshots and the frontend check.
---

# Building a screen

1. **Read first.** `frontend/DESIGN.md` for the rules, and
   `frontend/src/components/inhouse/index.ts` for the vocabulary this app
   already has. Compose from `inhouse/` first and `components/ui/` second. Do
   not invent a component when one exists or takes one more prop.
2. **Missing a primitive?** Find it with the shadcn CLI, never by hand:
   `pnpm exec shadcn search "<term>"`, then `view`, then `add`. Files under
   `components/ui/` are never edited afterwards — a hook refuses it. Anything
   app-specific wraps them in `inhouse/`.
3. **Colour, money, dates, text.** Colours come from the tokens in
   `index.css`; there are no hex values, no Tailwind palette classes and no
   `dark:` classes, because dark mode is a token swap. Numbers and dates go
   through `lib/format.ts`. Charts live only under `components/charts/` and are
   imported lazily. Every string a person reads goes through `t()`.
4. **Design at 390 px, then 1280.** Tables become card rows under 640 px. A
   detail view is a page, or a bottom drawer on the phone — not a popup. A
   dialog or sheet always carries `max-h-[90dvh] overflow-y-auto`, or it cannot
   be scrolled on a phone. A button inside a form needs `type="submit"`.
5. **Lists** are paged in SQL through `PagedList`; filters live in the URL. See
   the `list-screen` skill rather than writing the paging again.
6. **Look at it.** When the screen is done — not after every edit — run
   `pnpm dev` in one shell and `pnpm shots /route` in another, then open both
   PNGs in `.shots/`. Add `SHOTS_DARK=1` only when tokens changed. A shot is
   the only thing that shows a broken layout; the checks cannot.
7. **Prove it.** `pnpm check` runs `scripts/check-frontend.mjs`, which enforces
   the rules above and the budget on how much JavaScript loads before the first
   screen appears.

Report what the owner will now see, and show the phone screenshot.
