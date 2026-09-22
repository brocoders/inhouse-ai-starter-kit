import { Link, type LinkProps } from '@tanstack/react-router';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

export type BarListRow = { name: string; value: number; link?: LinkProps };

/**
 * Ranked horizontal bars with the label on the bar and the figure beside it —
 * the breakdown that reads on a phone, where a pie or an XY chart does not.
 */
export function BarList({
  rows,
  format = (value: number) => formatNumber(value),
  className,
}: {
  rows: BarListRow[];
  /** How each figure is written; an Amount's formatter, usually. */
  format?: (value: number) => string;
  className?: string;
}) {
  const max = rows.reduce((highest, row) => Math.max(highest, row.value), 0);
  return (
    <div className={cn('space-y-1.5', className)}>
      {rows.map((row) => {
        const width = max > 0 ? (row.value / max) * 100 : 0;
        const label = (
          <span className="truncate" title={row.name}>
            {row.name}
          </span>
        );
        return (
          <div key={row.name} className="flex items-center gap-3 text-sm">
            <div className="relative flex h-8 min-w-0 flex-1 items-center">
              <div
                className="absolute inset-y-0 left-0 rounded bg-primary/15 dark:bg-primary/25"
                style={{ width: `${width}%` }}
              />
              {row.link ? (
                <Link {...row.link} className="relative flex min-w-0 px-2 hover:underline">
                  {label}
                </Link>
              ) : (
                <span className="relative flex min-w-0 px-2">{label}</span>
              )}
            </div>
            <span className="shrink-0 text-muted-foreground tabular-nums">{format(row.value)}</span>
          </div>
        );
      })}
    </div>
  );
}
