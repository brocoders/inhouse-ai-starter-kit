import { useRef, useState } from 'react';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ArrowLeft, Paperclip, Trash2, Upload } from 'lucide-react';
import { Attachment, AuditPage, Item } from '@shared/schemas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  ConfirmDialog,
  HistoryList,
  PageHeader,
  RefreshButton,
  StatusBadge,
} from '@/components/inhouse';
import { ItemForm } from '@/components/items/item-form';
import { api, errorMessage } from '@/lib/api';
import { canEdit, isOwner, useMe } from '@/lib/auth';
import { formatBytes, formatDate, formatDateTime, today } from '@/lib/format';
import { t } from '@/lib/i18n';
import { fieldName, fieldValue, statusLabel, statusTone } from '@/lib/items';

const Attachments = z.array(Attachment);

export const Route = createFileRoute('/items/$id')({ component: ItemPage });

function ItemPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe();
  const [editing, setEditing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const mayEdit = canEdit(me.data?.role);
  const item = useQuery({
    queryKey: ['items', id],
    queryFn: ({ signal }) => api.get(`/api/items/${id}`, Item, undefined, signal),
  });
  // The history is for the people who change records; the server refuses it
  // to a viewer, so a viewer's page does not ask.
  const history = useQuery({
    queryKey: ['audit', 'items', id],
    queryFn: () => api.get('/api/audit', AuditPage, { entity: 'items', entityId: id, limit: 50 }),
    enabled: mayEdit,
  });
  const files = useQuery({
    queryKey: ['attachments', 'items', id],
    queryFn: () => api.get('/api/attachments', Attachments, { entity: 'items', entityId: id }),
  });

  if (item.isPending)
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );
  if (item.isError) throw item.error;

  const record = item.data;
  const mayDelete = isOwner(me.data?.role);

  const refreshRecord = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['items'] }),
      queryClient.invalidateQueries({ queryKey: ['audit'] }),
    ]);
  };

  return (
    <div className="space-y-5">
      <Link
        to="/items"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        {t('items.title')}
      </Link>

      <PageHeader
        title={record.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge label={statusLabel(record.status)} tone={statusTone(record, today())} />
            <span className="text-xs text-muted-foreground">
              {t('items.created', { when: formatDateTime(record.createdAt) })}
            </span>
          </span>
        }
        actions={
          <>
            <RefreshButton />
            {mayEdit && !editing && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                {t('action.edit')}
              </Button>
            )}
            {mayDelete && (
              <ConfirmDialog
                trigger={
                  <Button size="sm" variant="destructive">
                    <Trash2 aria-hidden />
                    {t('action.delete')}
                  </Button>
                }
                title={t('items.deleteTitle')}
                body={t('items.deleteBody')}
                confirmLabel={t('action.delete')}
                onConfirm={async () => {
                  await api.delete(`/api/items/${id}`, z.unknown());
                  await refreshRecord();
                  toast.success(t('items.deleted'));
                  void navigate({ to: '/items' });
                }}
              />
            )}
          </>
        }
      />

      <Card className="shadow-xs">
        <CardContent>
          {editing ? (
            <ItemForm
              item={record}
              submitLabel={t('action.save')}
              onCancel={() => setEditing(false)}
              onSubmit={async (input) => {
                await api.patch(`/api/items/${id}`, Item, input);
                await refreshRecord();
                toast.success(t('items.saved'));
                setEditing(false);
              }}
            />
          ) : (
            <dl className="grid gap-4 sm:grid-cols-3">
              <Detail
                label={t('items.dueOn')}
                value={record.dueOn ? formatDate(record.dueOn) : '—'}
              />
              <Detail
                label={t('items.assignee')}
                value={record.assigneeName ?? t('items.unassigned')}
              />
              <Detail label={t('items.status')} value={statusLabel(record.status)} />
              <div className="sm:col-span-3">
                <dt className="text-xs font-medium text-muted-foreground">{t('items.notes')}</dt>
                <dd className="mt-1 text-sm whitespace-pre-wrap">{record.notes ?? '—'}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t('items.attachments')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {files.data?.length ? (
            <ul className="divide-y">
              {files.data.map((file) => (
                <li key={file.id} className="flex min-h-11 items-center gap-3 py-2 text-sm">
                  <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <a
                    href={`/api/attachments/${file.id}`}
                    className="min-w-0 flex-1 truncate hover:underline"
                    title={file.fileName}
                  >
                    {file.fileName}
                  </a>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatBytes(file.size)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('items.attachmentsEmpty')}</p>
          )}
          {mayEdit && (
            <>
              {/* A file input styled as a button is a label around a hidden
                  input, and Base UI's Button refuses to be anything but a real
                  <button>. So the button opens the picker instead. */}
              <input
                ref={fileInput}
                type="file"
                className="sr-only"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const body = new FormData();
                  body.append('file', file);
                  // Files are the one thing that does not go through the JSON
                  // layer: the browser has to set its own multipart boundary.
                  const response = await fetch(`/api/attachments?entity=items&entityId=${id}`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    body,
                  });
                  event.target.value = '';
                  if (!response.ok) {
                    toast.error(t('error.title'));
                    return;
                  }
                  await queryClient.invalidateQueries({ queryKey: ['attachments'] });
                }}
              />
              <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
                <Upload aria-hidden />
                {t('items.addFile')}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {mayEdit && (
        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t('items.history')}</CardTitle>
          </CardHeader>
          <CardContent>
            {history.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : history.isError ? (
              <p className="text-sm text-muted-foreground">{errorMessage(history.error)}</p>
            ) : history.data.rows.length ? (
              <HistoryList
                events={history.data.rows}
                fieldLabel={fieldName}
                valueLabel={fieldValue}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{t('items.historyEmpty')}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}
