import { Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, CircleDot, Clock, History } from 'lucide-react';
import { AuditPage, ItemPage } from '@shared/schemas';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, HistoryList, KpiCard, PageHeader, RefreshButton } from '@/components/inhouse';
import { BucketBars, type Bucket } from '@/components/charts';
import { api } from '@/lib/api';
import { canEdit, useMe } from '@/lib/auth';
import { dayOf, formatDate, formatNumber, shiftDay, today } from '@/lib/format';
import { t } from '@/lib/i18n';
import { fieldName, fieldValue } from '@/lib/items';

export const Route = createFileRoute('/')({ component: Home });

function Home() {
  const me = useMe();
  // Recent changes come from the history, which is a member's or an owner's
  // to read. A viewer's home page has the counts and the chart and no more.
  const mayReadHistory = canEdit(me.data?.role);
  // Three counts and a list. Each count asks for one row and reads `total`,
  // which is what the list endpoint already reports — a screen that only needs
  // a number should not download the rows behind it.
  const open = useQuery({
    queryKey: ['items', 'count', 'open'],
    queryFn: () => api.get('/api/items', ItemPage, { status: 'open', limit: 1 }),
  });
  const overdue = useQuery({
    queryKey: ['items', 'count', 'overdue'],
    queryFn: () => api.get('/api/items', ItemPage, { status: 'open', due: 'overdue', limit: 1 }),
  });
  // "Finished this week" has no filter of its own in the contract, so the
  // finished items are read and the recent ones counted here. Two hundred is
  // the page limit; a team that finishes more than that in a week has outgrown
  // this tile and should ask the server for the figure instead.
  const done = useQuery({
    queryKey: ['items', 'count', 'done-week'],
    queryFn: () => api.get('/api/items', ItemPage, { status: 'done', limit: 200 }),
  });
  const audit = useQuery({
    queryKey: ['audit', 'recent'],
    queryFn: () => api.get('/api/audit', AuditPage, { limit: 8 }),
    enabled: mayReadHistory,
  });

  // A count that could not be read is not zero. The route's error screen
  // shows the server's own sentence and the reference to quote, instead of a
  // row of reassuring noughts.
  const failed = [open, overdue, done, audit].find((query) => query.isError);
  if (failed?.error) throw failed.error;

  const todayDay = today();
  const since = shiftDay(todayDay, -7);
  // The day each item was finished on is the app's day, not UTC's: an item
  // closed at 23:30 in the office belongs to that day's bar.
  const doneThisWeek = (done.data?.rows ?? []).filter(
    (item) => dayOf(item.updatedAt) >= since,
  ).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('home.title')}
        description={t('home.description')}
        actions={<RefreshButton />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label={t('home.open')}
          value={open.isPending ? '—' : formatNumber(open.data?.total ?? 0)}
          note={t('home.openNote')}
          icon={CircleDot}
          link={{ to: '/items', search: { status: 'open' } }}
        />
        <KpiCard
          label={t('home.overdue')}
          value={overdue.isPending ? '—' : formatNumber(overdue.data?.total ?? 0)}
          note={t('home.overdueNote')}
          tone={overdue.data?.total ? 'warn' : 'plain'}
          icon={Clock}
          link={{ to: '/items', search: { status: 'open', due: 'overdue' } }}
        />
        <KpiCard
          label={t('home.doneWeek')}
          value={done.isPending ? '—' : formatNumber(doneThisWeek)}
          note={t('home.doneWeekNote', { date: formatDate(since) })}
          icon={CircleCheck}
          link={{ to: '/items', search: { status: 'done' } }}
        />
      </div>

      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t('home.finishedByWeek')}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* The chart arrives after the page does: Recharts is about as big
              as the rest of the app, and a figure is worth more than a bar. */}
          <Suspense fallback={<Skeleton className="h-44 w-full" />}>
            <BucketBars buckets={weeklyBuckets(done.data?.rows ?? [], todayDay)} />
          </Suspense>
        </CardContent>
      </Card>

      {mayReadHistory && (
        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t('home.recent')}</CardTitle>
          </CardHeader>
          <CardContent>
            {audit.isPending ? (
              <div className="space-y-2">
                {[0, 1, 2].map((n) => (
                  <Skeleton key={n} className="h-5 w-full" />
                ))}
              </div>
            ) : audit.data?.rows.length ? (
              <HistoryList
                events={audit.data.rows}
                fieldLabel={fieldName}
                valueLabel={fieldValue}
              />
            ) : (
              <EmptyState
                icon={History}
                title={t('home.recentEmpty')}
                text={t('home.recentEmptyBody')}
                className="border-0 py-6"
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * The last eight weeks of finished items, one bar each, the running week drawn
 * faintly. Worked out here from the rows the count above already asked for:
 * one request, two answers.
 */
function weeklyBuckets(rows: Array<{ updatedAt: string }>, todayDay: string): Bucket[] {
  const buckets: Bucket[] = [];
  for (let week = 7; week >= 0; week -= 1) {
    const start = shiftDay(todayDay, -7 * week - 6);
    const end = shiftDay(todayDay, -7 * week);
    buckets.push({
      label: formatDate(end),
      value: rows.filter((row) => {
        const day = dayOf(row.updatedAt);
        return day >= start && day <= end;
      }).length,
      open: week === 0,
    });
  }
  return buckets;
}
