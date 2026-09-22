import { useEffect, useState } from 'react';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ChevronRight, ListChecks, Plus, SearchX } from 'lucide-react';
import { z } from 'zod';
import { ItemPage, ItemStatus, page as pageOf, User, type Item } from '@shared/schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Choice,
  EmptyState,
  Field,
  FilterBar,
  PageHeader,
  PagedList,
  RefreshButton,
  StatusBadge,
} from '@/components/inhouse';
import { api } from '@/lib/api';
import { canEdit, useMe } from '@/lib/auth';
import { formatDate, formatNumber, today } from '@/lib/format';
import { t } from '@/lib/i18n';
import { isOverdue, statusLabel, statusTone } from '@/lib/items';
import { cn } from '@/lib/utils';

// The filters live in the address, not in a component's memory: a filtered
// list can be sent to a colleague, kept in a bookmark and reached again with
// the back button. Anything the schema does not recognise is dropped rather
// than carried around.
const Search = z.object({
  q: z.string().trim().max(200).optional(),
  status: ItemStatus.optional(),
  due: z.enum(['overdue', 'week', 'none']).optional(),
  assigneeId: z.string().optional(),
});
export type ItemsSearch = z.infer<typeof Search>;

const UserPage = pageOf(User);
const PAGE_SIZE = 25;

export const Route = createFileRoute('/items/')({
  component: Items,
  validateSearch: Search,
});

function Items() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const me = useMe();
  const mayEdit = canEdit(me.data?.role);
  const todayDay = today();

  // The text box answers every keystroke, the address and the server every
  // third of a second: typing must never feel like it is waiting for a round
  // trip, and the history must not gain an entry per letter.
  const [typed, setTyped] = useState(search.q ?? '');
  useEffect(() => setTyped(search.q ?? ''), [search.q]);
  useEffect(() => {
    const value = typed.trim();
    if (value === (search.q ?? '')) return;
    const timer = setTimeout(() => {
      void navigate({
        search: (previous) => ({ ...previous, q: value || undefined }),
        replace: true,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [typed, search.q, navigate]);

  const people = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/api/users', UserPage),
  });

  const list = useInfiniteQuery({
    queryKey: ['items', search],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.get(
        '/api/items',
        ItemPage,
        {
          limit: PAGE_SIZE,
          cursor: pageParam,
          q: search.q,
          status: search.status,
          due: search.due,
          assigneeId: search.assigneeId,
        },
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;
  const filtered = Boolean(search.q || search.status || search.due || search.assigneeId);

  const set = (patch: Partial<ItemsSearch>) =>
    void navigate({ search: (previous) => ({ ...previous, ...patch }) });

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('items.title')}
        description={t('items.description')}
        actions={
          <>
            <RefreshButton />
            {mayEdit && (
              <Link to="/items/new">
                <Button size="sm">
                  <Plus aria-hidden />
                  {t('items.new')}
                </Button>
              </Link>
            )}
          </>
        }
      />

      <FilterBar>
        <Field label={t('items.search')} htmlFor="items-q" className="min-w-48 sm:flex-1">
          <Input
            id="items-q"
            type="search"
            placeholder={t('items.searchPlaceholder')}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </Field>
        <Field label={t('items.status')} htmlFor="items-status">
          <Choice
            id="items-status"
            className="w-full"
            value={search.status ?? 'any'}
            onChange={(value) =>
              set({ status: value === 'any' ? undefined : (value as ItemStatus) })
            }
            options={[
              { value: 'any', label: t('items.anyStatus') },
              { value: 'open', label: t('items.statusOpen') },
              { value: 'done', label: t('items.statusDone') },
            ]}
          />
        </Field>
        <Field label={t('items.due')} htmlFor="items-due">
          <Choice
            id="items-due"
            className="w-full"
            value={search.due ?? 'any'}
            onChange={(value) =>
              set({ due: value === 'any' ? undefined : (value as ItemsSearch['due']) })
            }
            options={[
              { value: 'any', label: t('items.anyDue') },
              { value: 'overdue', label: t('items.dueOverdue') },
              { value: 'week', label: t('items.dueWeek') },
              { value: 'none', label: t('items.dueNone') },
            ]}
          />
        </Field>
        <Field label={t('items.assignee')} htmlFor="items-assignee">
          <Choice
            id="items-assignee"
            className="w-full"
            value={search.assigneeId ?? 'any'}
            onChange={(value) => set({ assigneeId: value === 'any' ? undefined : value })}
            options={[
              { value: 'any', label: t('items.anyone') },
              ...(people.data?.rows ?? []).map((person) => ({
                value: person.id,
                label: person.name,
              })),
            ]}
          />
        </Field>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => void navigate({ search: {} })}>
            {t('action.clear')}
          </Button>
        )}
      </FilterBar>

      <PagedList
        items={rows}
        keyOf={(item) => item.id}
        estimateSize={64}
        loading={list.isPending}
        hasMore={Boolean(list.hasNextPage)}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={() => void list.fetchNextPage()}
        label={t('items.title')}
        footer={
          rows.length < total
            ? t('list.showingOf', { shown: formatNumber(rows.length), total: formatNumber(total) })
            : t('items.count', { count: total })
        }
        empty={
          filtered ? (
            <EmptyState
              icon={SearchX}
              title={t('items.emptyFiltered')}
              text={t('items.emptyFilteredBody')}
              action={
                <Button variant="outline" onClick={() => void navigate({ search: {} })}>
                  {t('action.clear')}
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={ListChecks}
              title={t('items.emptyTitle')}
              text={t('items.emptyBody')}
              action={
                mayEdit ? (
                  <Link to="/items/new">
                    <Button>{t('items.new')}</Button>
                  </Link>
                ) : undefined
              }
            />
          )
        }
        renderRow={(item) => <ItemRow item={item} todayDay={todayDay} />}
      />
    </div>
  );
}

/**
 * One row, two shapes. Under 640 pixels the columns stack into a card row with
 * the title first and everything else on a second line, because a table of
 * five columns on a phone is either unreadable or scrolls sideways, and the
 * design system forbids both.
 */
function ItemRow({ item, todayDay }: { item: Item; todayDay: string }) {
  const late = isOverdue(item, todayDay);
  return (
    <Link
      to="/items/$id"
      params={{ id: item.id }}
      className="flex min-h-14 items-center gap-3 border-b px-4 py-2.5 transition-colors last:border-b-0 hover:bg-muted/40 sm:min-h-10"
    >
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm', item.status === 'done' && 'text-muted-foreground')}>
          {item.title}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground sm:hidden">
          <span className={late ? 'text-negative' : undefined}>
            {item.dueOn ? formatDate(item.dueOn) : t('items.dueNone')}
          </span>
          <span>·</span>
          <span className="truncate">{item.assigneeName ?? t('items.unassigned')}</span>
        </p>
      </div>
      <span
        className={cn(
          'hidden w-28 shrink-0 text-right text-xs tabular-nums sm:block',
          late ? 'text-negative' : 'text-muted-foreground',
        )}
      >
        {item.dueOn ? formatDate(item.dueOn) : '—'}
      </span>
      <span className="hidden w-32 shrink-0 truncate text-xs text-muted-foreground sm:block">
        {item.assigneeName ?? t('items.unassigned')}
      </span>
      <StatusBadge
        label={statusLabel(item.status)}
        tone={statusTone(item, todayDay)}
        className="shrink-0"
      />
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
