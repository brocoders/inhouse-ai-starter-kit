# Design system

The one file to read before touching a screen. Rules, not suggestions:
`scripts/check-frontend.mjs` enforces the ones a script can. The reference is
the Tremor dashboard (dashboard.tremor.so): quiet, dense, numbers loudest.

## Tokens

Colours exist only as the CSS variables in `src/index.css`; components use the
semantic Tailwind names and never a raw colour.

| Name                         | Use                                                             |
| ---------------------------- | --------------------------------------------------------------- |
| `background` / `foreground`  | page and body text                                              |
| `card`                       | surfaces: cards, popovers, sheets                               |
| `primary`                    | one accent: buttons, active state, the main series              |
| `muted` / `muted-foreground` | secondary surfaces and secondary text                           |
| `border`                     | every hairline                                                  |
| `positive` / `negative`      | deltas and status only, never decoration                        |
| `warning`                    | something that needs attention but has not failed               |
| `destructive`                | destructive actions                                             |
| `chart-1` … `chart-6`        | series, in this order: blue, emerald, violet, amber, gray, cyan |

Radius: `rounded-md` for controls, `rounded-xl` for cards. Shadows: `shadow-xs`
on cards, nothing larger. Dark mode is a token swap under `[data-theme=dark]`;
no `dark:` colour classes in components.

## Type

Inter, self-hosted. This scale, and nothing outside it:

| Role                            | Classes                                |
| ------------------------------- | -------------------------------------- |
| Page title                      | `text-lg font-semibold tracking-tight` |
| Card title                      | `text-sm font-medium`                  |
| KPI value                       | `text-2xl font-semibold tabular-nums`  |
| Body                            | `text-sm`                              |
| Meta, axis ticks, table headers | `text-xs text-muted-foreground`        |

Every figure is `tabular-nums` and formatted by `lib/format.ts`. Amounts are
whole numbers of their smallest unit — cents, grams, minutes — and `Amount`
writes them; negatives take a true minus sign (−).

## Space and density

Tailwind's scale only: `gap-2` within a control group, `gap-4` between related
groups, `gap-6` between sections. Card padding `p-4`, `p-6` on desktop. Rows are
40 px on desktop and at least 44 px on the phone. Pages are one column under
1024 px.

**Every page root is `space-y-5`.** One value, on every screen, so the step from
the header to the first thing under it is the same wherever you are. What breaks
that impression is not the number but what fills it: a page whose first element
is a bordered control reads tight, and one that opens with a stacked field
label or a strip of grey meta text reads loose at the identical gap. Do not tune
the spacing per screen — give the first element some ink, or take the
light-weight thing out. A `Field` whose control already states its own value
takes `hideLabel`, which keeps the label for a screen reader and the 24 px off
the screen.

## Components

Compose from `src/components/inhouse/index.ts` first, `src/components/ui/`
second. **Never edit a file in `components/ui/`** — re-add it from the registry.
Do not write a new component when an existing one takes a prop.

To find a primitive that does not exist yet:

```
pnpm exec shadcn search @shadcn -q "<term>"     # from frontend/
pnpm exec shadcn view @shadcn/<name>
pnpm exec shadcn add -y @shadcn/<name>
```

The CLI runs in `frontend/`, where `components.json` is. `frontend/package.json`
exists only because the CLI refuses to run without one; nothing is installed
from it, and any dependency it adds there belongs in the repository's own
`package.json` instead.

## Refreshing

There is one way to re-read the server and it belongs to the shell, not to a
screen. On a desktop it is `RefreshButton`, first among a `PageHeader`'s
actions; on a phone or a tablet it is the pull-down gesture in
`components/shell/pull-to-refresh.tsx`, and the button hides itself there
(`pointer-coarse:hidden`) so the two never both appear. Both call
`invalidateAll()`, which makes every cached query stale **and** advances the
`useRefreshSignal()` number, so a screen that fetches in an effect gets the
same refresh. Do not give a screen a Refresh button of its own.

## Charts

Recharts, imported only inside `src/components/charts/`, reached only through
the lazy exports in its `index.ts`. Rules: no axis lines, no tick lines,
hairline horizontal grid (`border`, dashed 3 3), ticks `text-xs
muted-foreground`, strokes 2 px, no dots, bars radius 4 and at most 28 px wide,
tooltip a small `card` with a `border`, legend as text with a colour dot.
Series take `chart-1` … `chart-6` in order; the main series is `primary`.

On the phone (`< 640px`): prefer `BarList`, a `CategoryBar` or a sparkline over
an XY chart. Where an XY chart stays: no Y axis, at most five X ticks, height
`h-44`, tooltips on tap.

## Phone

Design at 390 px first. Tables become card rows under 640 px. Detail views are
their own page, or a bottom drawer on the phone — not a popup. No horizontal
page scroll, ever; long text truncates with a `title` attribute. The tab bar
pads itself out of the home bar with `env(safe-area-inset-bottom)`, and page
content leaves `pb-24` for it.

## Forms

Every `<form>` has a real `type="submit"` button, so Return works. Validation
messages go under the field they belong to, through `FormField`, never in a
banner at the top. Everything is disabled while the save is in flight — one
`<fieldset disabled>` does it — and the button says what is happening. The
server's answer wins: its field messages replace the form's own.

## Text

Every string a person can read goes through `t()` and lives in `lib/en.ts`.
No sentence in a component. A second language is then a second file, not a
sweep through the screens.

## Don't

No hex colours in `.tsx`, and no Tailwind palette classes either
(`text-amber-700`, `bg-emerald-500/10`…): warnings are `warning`, deltas
`positive`/`negative`, series `chart-1`…`chart-6`. No `Intl` outside
`lib/format.ts`. No hand-built date field: one day is a `type="date"` input
inside a `FormField`, a stretch of days is `PeriodPicker`, and nothing else. No raw
`<table>`; use the data table or card rows. No raw `Select`; use `Choice`,
which carries the labels Base UI needs and never reports an empty pick. No
`asChild`; Base UI composes with `render={<a href … />}`. No new spacing
values, no new font sizes, no new shadows. No screen-specific Refresh button.
No sentence written straight into a component.
