import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type StatusTone = 'neutral' | 'good' | 'warn' | 'bad';

/**
 * A state, said in a word and a colour. The colour is the meaning — good,
 * needs attention, wrong — never decoration, so two states that differ only by
 * name take the same tone.
 */
export function StatusBadge({
  label,
  tone = 'neutral',
  className,
}: {
  label: string;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5',
        tone === 'good' && 'border-positive/30 text-positive',
        tone === 'warn' && 'border-warning/30 text-warning',
        tone === 'bad' && 'border-negative/30 text-negative',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          tone === 'neutral' && 'bg-muted-foreground',
          tone === 'good' && 'bg-positive',
          tone === 'warn' && 'bg-warning',
          tone === 'bad' && 'bg-negative',
        )}
      />
      {label}
    </Badge>
  );
}
