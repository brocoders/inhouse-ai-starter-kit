import { Suspense, lazy } from 'react';
import {
  Link,
  Outlet,
  createRootRoute,
  useRouterState,
  type ErrorComponentProps,
} from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { Boxes, CircleAlert, FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/inhouse/empty-state';
import { AppSidebar } from '@/components/shell/app-sidebar';
import { AppUpdate } from '@/components/shell/app-update';
import { PullToRefresh } from '@/components/shell/pull-to-refresh';
import { TabBar } from '@/components/shell/tab-bar';
import { useMe } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { FormatProvider } from '@/lib/format';
import { t } from '@/lib/i18n';
import { queryClient } from '@/lib/query';
import { useTheme } from '@/lib/theme';

// The person's own menu is the last thing anybody looks at and it carries the
// whole floating-menu machinery with it — about a third of the shell's weight.
// It arrives a moment after the page does, and nothing waits for it.
const UserMenu = lazy(() =>
  import('@/components/shell/user-menu').then((module) => ({ default: module.UserMenu })),
);

export const Route = createRootRoute({
  component: Root,
  errorComponent: ScreenError,
  notFoundComponent: NotFound,
});

function Root() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // Signing in happens outside the shell: there is no navigation to offer
  // someone who cannot yet see any of it.
  const bare = pathname === '/sign-in';
  return (
    <QueryClientProvider client={queryClient}>
      {bare ? <Outlet /> : <Shell />}
      <Toaster position="bottom-center" closeButton toastOptions={{ className: 'text-sm' }} />
      <AppUpdate />
    </QueryClientProvider>
  );
}

function Shell() {
  const me = useMe();
  // The theme is read here so that switching it re-renders the shell, which is
  // what makes the choice visible the moment it is made.
  useTheme();

  if (me.isPending)
    return (
      <div className="mx-auto w-full max-w-5xl space-y-5 p-4 md:p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );

  // An `auth` failure has already sent the person to the sign-in screen from
  // lib/api.ts; anything else is a server that cannot answer, and saying so is
  // better than a sign-in form that could not possibly help.
  if (me.isError)
    return (
      <div className="mx-auto w-full max-w-md p-6">
        <EmptyState
          icon={CircleAlert}
          title={t('error.title')}
          text={errorMessage(me.error)}
          action={
            <Button variant="outline" onClick={() => void me.refetch()}>
              {t('action.retry')}
            </Button>
          }
        />
      </div>
    );

  const person = me.data;
  return (
    <FormatProvider settings={{ locale: person.locale, timeZone: person.timeZone }}>
      <div className="flex min-h-dvh">
        <AppSidebar
          role={person.role}
          footer={
            <Suspense fallback={<div className="h-10" />}>
              <UserMenu me={person} className="w-full" />
            </Suspense>
          }
        />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* The phone has no sidebar, so the app's name and the person's own
              menu live in a bar that stays put while the page scrolls. */}
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b bg-card/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
            <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Boxes className="size-4" aria-hidden />
              </span>
              {t('app.name')}
            </Link>
            <Suspense fallback={<div className="size-8" />}>
              <UserMenu me={person} />
            </Suspense>
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 pb-24 md:px-6 md:pb-8">
            <Outlet />
          </main>
        </div>
      </div>
      <TabBar role={person.role} />
      <PullToRefresh />
    </FormatProvider>
  );
}

/** Any screen that throws lands here rather than taking the app down. */
function ScreenError({ error }: ErrorComponentProps) {
  return (
    <div className="mx-auto w-full max-w-md p-6">
      <EmptyState
        icon={CircleAlert}
        title={t('error.title')}
        text={errorMessage(error)}
        action={
          <Button variant="outline" onClick={() => window.location.reload()}>
            {t('action.retry')}
          </Button>
        }
      />
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto w-full max-w-md p-6">
      <EmptyState
        icon={FileQuestion}
        title={t('error.notFoundTitle')}
        text={t('error.notFoundBody')}
        action={
          <Link to="/">
            <Button variant="outline">{t('nav.home')}</Button>
          </Link>
        }
      />
    </div>
  );
}
