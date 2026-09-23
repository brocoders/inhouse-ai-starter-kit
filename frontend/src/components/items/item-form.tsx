import { useState, type FormEvent } from 'react';
import { type Item, type ItemInput } from '@shared/schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Choice, FormField } from '@/components/inhouse';
import { fieldErrors } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useUsers } from '@/lib/users';

/**
 * The form both the new-item screen and the record page use.
 *
 * Every rule the design system asks of a form is here once: a real submit
 * button so the keyboard's Return works, the message about a field under that
 * field, and everything disabled while the save is in flight so nobody sends
 * the same thing twice.
 */
export function ItemForm({
  item,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  item?: Item;
  submitLabel: string;
  onSubmit: (input: ItemInput) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(item?.title ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [status, setStatus] = useState<'open' | 'done'>(item?.status ?? 'open');
  const [dueOn, setDueOn] = useState(item?.dueOn ?? '');
  const [assigneeId, setAssigneeId] = useState(item?.assigneeId ?? '');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const people = useUsers();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!title.trim()) {
      setErrors({ title: t('form.required') });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      await onSubmit({
        title: title.trim(),
        notes: notes.trim() ? notes.trim() : null,
        status,
        dueOn: dueOn || null,
        assigneeId: assigneeId || null,
      });
    } catch (cause) {
      // The server validates too, and its answer is the one that counts: it
      // knows the rules this form only mirrors.
      const fields = fieldErrors(cause);
      setErrors(
        Object.keys(fields).length
          ? fields
          : { title: cause instanceof Error ? cause.message : t('signIn.failed') },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <fieldset disabled={busy} className="space-y-4">
        <FormField id="item-title" label={t('items.title.label')} error={errors.title}>
          <Input
            id="item-title"
            value={title}
            autoFocus={!item}
            maxLength={200}
            placeholder={t('items.titlePlaceholder')}
            aria-invalid={Boolean(errors.title)}
            onChange={(event) => setTitle(event.target.value)}
          />
        </FormField>
        <FormField id="item-notes" label={t('items.notes')} error={errors.notes}>
          <Textarea
            id="item-notes"
            rows={4}
            maxLength={5000}
            placeholder={t('items.notesPlaceholder')}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="item-status" label={t('items.status')} error={errors.status}>
            <Choice
              id="item-status"
              className="w-full"
              value={status}
              onChange={(value) => setStatus(value as 'open' | 'done')}
              options={[
                { value: 'open', label: t('items.statusOpen') },
                { value: 'done', label: t('items.statusDone') },
              ]}
            />
          </FormField>
          <FormField id="item-due" label={t('items.dueOn')} error={errors.dueOn}>
            <Input
              id="item-due"
              type="date"
              className="w-full"
              value={dueOn}
              onChange={(event) => setDueOn(event.target.value)}
            />
          </FormField>
          <FormField id="item-assignee" label={t('items.assignee')} error={errors.assigneeId}>
            <Choice
              id="item-assignee"
              className="w-full"
              value={assigneeId || 'none'}
              onChange={(value) => setAssigneeId(value === 'none' ? '' : value)}
              options={[
                { value: 'none', label: t('items.unassigned') },
                ...(people.data?.rows ?? [])
                  .filter((person) => person.active)
                  .map((person) => ({ value: person.id, label: person.name })),
              ]}
            />
          </FormField>
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? t('action.saving') : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
            {t('action.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}
