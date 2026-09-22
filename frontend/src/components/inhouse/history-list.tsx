import type { AuditEvent } from '@shared/schemas';
import { formatRelative } from '@/lib/format';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * What happened to a record, in sentences rather than a table of columns.
 *
 * "Rita changed status from open to done · 2 hr. ago" is the whole feature. The
 * kit deliberately has no history screen beyond this: a plain list answers
 * "who changed this and when", and anything richer is a report somebody has to
 * maintain.
 */
export function HistoryList({
  events,
  /** How a field's name is written for a person, when it is not obvious. */
  fieldLabel = (field: string) => field,
  /** How a stored value is written for a person. */
  valueLabel = (_field: string, value: unknown) => describe(value),
  className,
}: {
  events: AuditEvent[];
  fieldLabel?: (field: string) => string;
  valueLabel?: (field: string, value: unknown) => string;
  className?: string;
}) {
  return (
    <ul className={cn('space-y-3', className)}>
      {events.map((event) => (
        <li key={event.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="text-foreground">{sentence(event, fieldLabel, valueLabel)}</span>
          <span className="text-xs text-muted-foreground">·</span>
          <time
            dateTime={event.at}
            title={event.at}
            className="text-xs whitespace-nowrap text-muted-foreground"
          >
            {formatRelative(event.at)}
          </time>
        </li>
      ))}
    </ul>
  );
}

function describe(value: unknown): string {
  if (value === null || value === undefined || value === '') return t('history.empty');
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
}

function sentence(
  event: AuditEvent,
  fieldLabel: (field: string) => string,
  valueLabel: (field: string, value: unknown) => string,
): string {
  const actor = event.actorName ?? t('history.someone');
  if (event.action === 'created') return t('history.created', { actor });
  if (event.action === 'deleted') return t('history.deleted', { actor });
  if (event.action === 'restored') return t('history.restored', { actor });
  const changes = Object.entries(event.changes);
  if (!changes.length) return t('history.created', { actor });
  // One line per event, not per field: an edit that touched three fields is
  // one thing the person did, and three lines make it look like three.
  return changes
    .map(([field, change], index) => {
      const who = index === 0 ? actor : '';
      const name = fieldLabel(field);
      const from = valueLabel(field, change.from);
      const to = valueLabel(field, change.to);
      if (change.from === null || change.from === undefined || change.from === '')
        return t('history.set', { actor: who, field: name, to }).trim();
      if (change.to === null || change.to === undefined || change.to === '')
        return t('history.cleared', { actor: who, field: name }).trim();
      return t('history.changed', { actor: who, field: name, from, to }).trim();
    })
    .join(', ');
}
