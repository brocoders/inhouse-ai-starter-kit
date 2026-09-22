import { Link, type LinkProps } from '@tanstack/react-router';
import { cn } from '@/lib/utils';

export type Segment = {
  label: string;
  /** Any non-negative magnitude; the shares are computed from the set. */
  value: number;
  /** A chart token, 1–6; defaults to the position in the list. */
  tone?: number;
  link?: LinkProps;
};

/** One bar split into shares, with a legend that carries the percentages. */
export function CategoryBar({ segments, className }: { segments: Segment[]; className?: string }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const shown = segments.filter((segment) => segment.value > 0);
  const percent = (value: number) => (total ? `${Math.round((value / total) * 1000) / 10}%` : '0%');
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
        {shown.map((segment, index) => (
          <div
            key={segment.label}
            className="h-full"
            style={{
              width: `${total ? (segment.value / total) * 100 : 0}%`,
              background: `var(--color-chart-${segment.tone ?? (index % 6) + 1})`,
            }}
            title={`${segment.label} · ${percent(segment.value)}`}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {shown.map((segment, index) => (
          <li key={segment.label} className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ background: `var(--color-chart-${segment.tone ?? (index % 6) + 1})` }}
            />
            {segment.link ? (
              <Link {...segment.link} className="hover:underline">
                {segment.label}
              </Link>
            ) : (
              <span>{segment.label}</span>
            )}
            <span className="text-muted-foreground tabular-nums">{percent(segment.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
