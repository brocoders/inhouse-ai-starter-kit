import { useState } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatDate, today } from '@/lib/format';
import { cn } from '@/lib/utils';

/** A stretch of calendar days, inclusive at both ends. */
export type Period = { from: string; to: string };

/**
 * The presets every screen that asks "when" offers, in this order. They are
 * named rather than computed from a generic "last N days", because a person
 * asks for "this month", not for "the last thirty-one days".
 */
export const periodPresets = [
  { key: 'month', label: 'This month' },
  { key: 'previous', label: 'Last month' },
  { key: 'quarter', label: 'This quarter' },
  { key: 'year', label: 'This year' },
] as const;

export type PresetKey = (typeof periodPresets)[number]['key'];

const pad = (n: number) => String(n).padStart(2, '0');
const dayOf = (year: number, month: number, date: number) =>
  `${year}-${pad(month + 1)}-${pad(date)}`;

/**
 * A preset as a pair of days, worked out in the app's own time zone. A person
 * in another country must see the same "this month" as everyone else, which is
 * why the current day comes from lib/format and not from `new Date()`.
 */
export function presetPeriod(key: PresetKey, from: string = today()): Period {
  const [y, m, d] = from.split('-').map(Number) as [number, number, number];
  const year = y;
  const month = m - 1;
  const lastDayOf = (yy: number, mm: number) => new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  switch (key) {
    case 'month':
      return { from: dayOf(year, month, 1), to: dayOf(year, month, lastDayOf(year, month)) };
    case 'previous': {
      const py = month === 0 ? year - 1 : year;
      const pm = month === 0 ? 11 : month - 1;
      return { from: dayOf(py, pm, 1), to: dayOf(py, pm, lastDayOf(py, pm)) };
    }
    case 'quarter': {
      const start = Math.floor(month / 3) * 3;
      return {
        from: dayOf(year, start, 1),
        to: dayOf(year, start + 2, lastDayOf(year, start + 2)),
      };
    }
    case 'year':
      return { from: dayOf(year, 0, 1), to: dayOf(year, 11, 31) };
    default:
      return { from: dayOf(year, month, d), to: dayOf(year, month, d) };
  }
}

/** The stretch of the same length that ends the day before this one. */
export function previousPeriod({ from, to }: Period): Period | null {
  if (!from || !to || from > to) return null;
  const shift = (day: string, days: number) => {
    const date = new Date(`${day}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const days =
    Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
  const previousTo = shift(from, -1);
  return { from: shift(previousTo, -(days - 1)), to: previousTo };
}

function describe({ from, to }: Period): string {
  if (!from || !to) return 'Choose a period';
  return `${formatDate(from)} – ${formatDate(to)}`;
}

/**
 * One button naming the stretch of days a screen is showing; behind it the
 * presets and a pair of days for anything else. A bottom sheet on the phone, a
 * dialog on a desktop.
 *
 * This is the only component in the kit allowed a raw date input: every other
 * screen asks for a period through here, so the way days are picked can change
 * in one file.
 */
export function PeriodPicker({
  value,
  onChange,
  size = 'sm',
  className,
  label = 'Period',
}: {
  value: Period;
  onChange: (period: Period) => void;
  size?: 'sm' | 'default';
  className?: string;
  label?: string;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Period>(value);
  const active = periodPresets.find((preset) => {
    const range = presetPeriod(preset.key);
    return range.from === value.from && range.to === value.to;
  });

  const start = (next: boolean) => {
    setOpen(next);
    if (next) setDraft(value);
  };
  const apply = (period: Period) => {
    onChange(period);
    setOpen(false);
  };

  const trigger = (
    <Button variant="outline" size={size} aria-label={label} className={cn('gap-2', className)}>
      <CalendarDays aria-hidden />
      {active ? `${active.label} · ${describe(value)}` : describe(value)}
      <ChevronDown className="opacity-60" aria-hidden />
    </Button>
  );

  const body = (
    <div className="space-y-4 p-1">
      <div className="flex flex-wrap gap-1.5">
        {periodPresets.map((preset) => (
          <Button
            key={preset.key}
            size="sm"
            variant={active?.key === preset.key ? 'secondary' : 'ghost'}
            onClick={() => apply(presetPeriod(preset.key))}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3 border-t pt-4">
        <div className="min-w-32 flex-1">
          <label htmlFor="period-from" className="mb-1.5 block text-xs text-muted-foreground">
            From
          </label>
          <Input
            id="period-from"
            type="date"
            value={draft.from}
            max={draft.to}
            onChange={(event) => setDraft({ ...draft, from: event.target.value })}
          />
        </div>
        <div className="min-w-32 flex-1">
          <label htmlFor="period-to" className="mb-1.5 block text-xs text-muted-foreground">
            To
          </label>
          <Input
            id="period-to"
            type="date"
            value={draft.to}
            min={draft.from}
            onChange={(event) => setDraft({ ...draft, to: event.target.value })}
          />
        </div>
        <Button
          size="sm"
          disabled={!draft.from || !draft.to || draft.from > draft.to}
          onClick={() => apply(draft)}
        >
          Apply
        </Button>
      </div>
    </div>
  );

  if (isMobile)
    return (
      <Sheet open={open} onOpenChange={start}>
        <SheetTrigger render={trigger} />
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{label}</SheetTitle>
            <SheetDescription>Choose the days to show.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">{body}</div>
        </SheetContent>
      </Sheet>
    );
  return (
    <Dialog open={open} onOpenChange={start}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>Choose the days to show.</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
