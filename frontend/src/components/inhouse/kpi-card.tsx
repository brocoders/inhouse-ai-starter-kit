import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, type LinkProps } from '@tanstack/react-router';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * One figure the way the Tremor dashboard shows it: a quiet label, the number
 * loud, and one line underneath saying what it is. The whole tile is a link
 * when there are records behind the figure — which there nearly always are,
 * and a figure nobody can open is a figure nobody trusts.
 */
export function KpiCard({
  label,
  value,
  note,
  tone = 'plain',
  link,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  /** `warn` for a figure that is bad news when it is not zero. */
  tone?: 'plain' | 'warn' | 'good';
  /** Where the records behind the figure are, as the router describes them. */
  link?: LinkProps;
  icon?: LucideIcon;
}) {
  const body = (
    <CardContent className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {Icon && <Icon className="size-4 text-muted-foreground" aria-hidden />}
      </div>
      <p
        className={cn(
          'mt-2 text-2xl font-semibold tracking-tight tabular-nums',
          tone === 'warn' && 'text-negative',
          tone === 'good' && 'text-positive',
        )}
      >
        {value}
      </p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </CardContent>
  );
  if (!link) return <Card className="gap-0 py-0 shadow-xs">{body}</Card>;
  return (
    <Link
      {...link}
      className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card className="gap-0 py-0 shadow-xs transition-colors hover:bg-muted/40">{body}</Card>
    </Link>
  );
}
