import type { AuditEvent } from '@shared/schemas';
import { formatRelative } from '@/lib/format';
import { describeValue } from '@/lib/history-text';
import { t, type TextKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * What happened to a record, in sentences rather than a table of columns.
 *
 * "Rita changed status from open to done · 2 hr. ago" is the whole feature. The
 * kit deliberately has no history screen beyond this: a plain list answers
 * "who changed this and when", and anything richer is a report somebody has to
 * maintain.
 *
 * The actions come from `shared/audit.ts`; each has one sentence in the
 * dictionary under `history.<action>`. A value with no better name is written
 * by `lib/history-text.ts`, never as [object Object] or a 36-character id.
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
  return describeValue(value, {
    empty: t('history.empty'),
    record: t('history.record'),
    yes: t('history.yes'),
    no: t('history.no'),
  });
}

const isEmpty = (value: unknown) => value === null || value === undefined || value === '';

function sentence(
  event: AuditEvent,
  fieldLabel: (field: string) => string,
  valueLabel: (field: string, value: unknown) => string,
): string {
  const actor = event.actorName ?? t('history.someone');
  const changes = Object.entries(event.changes);
  // Every action but an update is one sentence about the whole record; an
  // update with nothing recorded reads as the record appearing.
  if (event.action !== 'updated' || !changes.length) {
    const key: TextKey = event.action === 'updated' ? 'history.created' : `history.${event.action}`;
    return t(key, { actor });
  }
  // One line per event, not per field: an edit that touched three fields is
  // one thing the person did, and three lines make it look like three.
  return changes
    .map(([field, change], index) => {
      const who = index === 0 ? actor : '';
      const name = fieldLabel(field);
      const from = valueLabel(field, change.from);
      const to = valueLabel(field, change.to);
      if (isEmpty(change.from)) return t('history.set', { actor: who, field: name, to }).trim();
      if (isEmpty(change.to)) return t('history.cleared', { actor: who, field: name }).trim();
      return t('history.changed', { actor: who, field: name, from, to }).trim();
    })
    .join(', ');
}
