---
paths:
  - 'frontend/**'
---

# Screens

Read `frontend/DESIGN.md` before changing a screen and compose from
`frontend/src/components/inhouse/index.ts` first, `components/ui/` second.
Design at 390 px first, then 1280. Tables become card rows under 640 px;
detail views are pages, or a bottom drawer on the phone — not popups. One
refresh mechanism: `RefreshButton` on desktop, pull-down on the phone. No
raw colours or Tailwind palette classes; no `Intl` outside `lib/format.ts`;
charts only under `components/charts/`. Every string a person reads goes
through `t()`. When the screen is done, run `pnpm shots /route` and look at
both PNGs before reporting.
