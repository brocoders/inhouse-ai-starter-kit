import { createFileRoute, redirect } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { OpsStatus } from '@shared/schemas';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CategoryBar, PageHeader, RefreshButton, StatusBadge } from '@/components/inhouse';
import { api } from '@/lib/api';
import { isOwner, meQueryKey, useMe } from '@/lib/auth';
import { formatBytes, formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import { t } from '@/lib/i18n';
import { queryClient } from '@/lib/query';
import { Me } from '@shared/schemas';

export const Route = createFileRoute('/health')({
  component: Health,
  // A viewer following a link to this address is sent home rather than shown
  // an empty page: the screen is the owner's, and the server enforces it too.
  beforeLoad: async () => {
    const me: Me =
      queryClient.getQueryData<Me>(meQueryKey) ??
      (await queryClient.fetchQuery<Me>({
        queryKey: meQueryKey,
        queryFn: () => api.get('/api/me', Me),
      }));
    if (!isOwner(me.role)) throw redirect({ to: '/' });
  },
});

function Health() {
  const me = useMe();
  const ops = useQuery({
    queryKey: ['ops'],
    queryFn: ({ signal }) => api.get('/api/ops', OpsStatus, undefined, signal),
  });

  if (!isOwner(me.data?.role)) return null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('health.title')}
        description={t('health.description')}
        actions={<RefreshButton />}
      />

      {ops.isPending ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : ops.isError ? (
        <Card className="shadow-xs">
          <CardContent className="text-sm text-destructive">{t('error.offline')}</CardContent>
        </Card>
      ) : (
        <Status status={ops.data} />
      )}
    </div>
  );
}

function Status({ status }: { status: OpsStatus }) {
  const disk = status.disk;
  return (
    <div className="space-y-5">
      {/* Problems first, and when there are none the page says so in one line
          rather than making the owner read a page of green ticks. */}
      {status.problems.length ? (
        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t('health.problems')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {status.problems.map((problem) => (
                <li key={problem.code} className="flex items-start gap-3 text-sm">
                  <TriangleAlert
                    className={
                      problem.severity === 'error'
                        ? 'mt-0.5 size-4 shrink-0 text-negative'
                        : 'mt-0.5 size-4 shrink-0 text-warning'
                    }
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    {problem.message}
                    {problem.since && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatRelative(problem.since)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-xs">
          <CardContent className="flex items-center gap-2 text-sm">
            <CircleCheck className="size-4 text-positive" aria-hidden />
            {t('health.allWell')}
          </CardContent>
        </Card>
      )}

      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t('health.jobs')}</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <ul className="divide-y">
            {status.jobs.map((job) => (
              <li
                key={job.name}
                className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm sm:min-h-12 sm:flex-nowrap"
              >
                <span className="min-w-0 flex-1 basis-full truncate font-medium sm:basis-auto">
                  {job.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t('health.queued')} {formatNumber(job.queued)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t('health.running')} {formatNumber(job.running)}
                </span>
                <span
                  className={
                    job.failed24h
                      ? 'text-xs font-medium text-negative'
                      : 'text-xs text-muted-foreground'
                  }
                >
                  {t('health.failed')} {formatNumber(job.failed24h)}
                </span>
                <span className="text-xs whitespace-nowrap text-muted-foreground sm:w-32 sm:text-right">
                  {job.lastSucceededAt ? formatRelative(job.lastSucceededAt) : t('health.never')}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t('health.recentErrors')}</CardTitle>
        </CardHeader>
        <CardContent>
          {status.recentErrors.length ? (
            <ul className="space-y-2">
              {status.recentErrors.map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="text-sm">
                  <span className="break-words">{entry.message}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatRelative(entry.at)} · {t('health.occurrences', { count: entry.count })}
                    {entry.requestId ? ` · ${t('error.requestId', { id: entry.requestId })}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('health.noErrors')}</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t('health.disk')}</CardTitle>
          </CardHeader>
          <CardContent>
            {disk ? (
              <div className="space-y-2">
                <CategoryBar
                  segments={[
                    { label: 'Used', value: disk.totalBytes - disk.freeBytes, tone: 5 },
                    { label: 'Free', value: disk.freeBytes, tone: 2 },
                  ]}
                />
                <p className="text-xs text-muted-foreground">
                  {t('health.diskFree', {
                    free: formatBytes(disk.freeBytes),
                    total: formatBytes(disk.totalBytes),
                  })}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-xs">
          <CardContent className="space-y-2 text-sm">
            <Line label={t('health.backup')}>
              {status.lastBackupAt ? formatRelative(status.lastBackupAt) : t('health.never')}
            </Line>
            <Line label={t('health.release')}>
              <span className="tabular-nums">{status.release.slice(0, 7)}</span>
            </Line>
            <Line label={t('health.startedAt')}>{formatDateTime(status.startedAt)}</Line>
            <Line label={t('health.database')}>
              <StatusBadge
                label={status.database}
                tone={status.database === 'ok' ? 'good' : 'bad'}
              />
            </Line>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}
