// What the worked example's fields are called, and how its values read.
//
// The example entity is the pattern every new app copies: a list, a record, a
// form, a history. Delete this file with it, and write the same two functions
// for whatever the app is really about — the history list asks for them so
// that "dueOn" never reaches a person's eyes.
import type { Item, ItemStatus } from '@shared/schemas';
import { formatDate } from './format';
import { t } from './i18n';
import type { StatusTone } from '@/components/inhouse';

const names: Record<string, string> = {
  title: 'title',
  notes: 'notes',
  status: 'status',
  dueOn: 'due day',
  assigneeId: 'who it is for',
};

export function fieldName(field: string): string {
  return names[field] ?? field;
}

export function fieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return t('history.empty');
  if (field === 'dueOn') return formatDate(String(value));
  if (field === 'status') return statusLabel(String(value) as ItemStatus);
  return String(value);
}

export function statusLabel(status: ItemStatus): string {
  return status === 'done' ? t('items.statusDone') : t('items.statusOpen');
}

/** Done is good, open is neutral; late is the only thing worth a colour. */
export function statusTone(item: Pick<Item, 'status' | 'dueOn'>, todayDay: string): StatusTone {
  if (item.status === 'done') return 'good';
  if (item.dueOn && item.dueOn < todayDay) return 'bad';
  return 'neutral';
}

export function isOverdue(item: Pick<Item, 'status' | 'dueOn'>, todayDay: string): boolean {
  return item.status === 'open' && !!item.dueOn && item.dueOn < todayDay;
}
