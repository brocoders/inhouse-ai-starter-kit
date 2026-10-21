import { lazy, Suspense, useState } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { Ellipsis } from 'lucide-react';
import type { Role } from '@shared/schemas';
import { t } from '@/lib/i18n';
import { screenLabel, visibleScreens, type Screen } from './navigation';
import { tabBarLayout } from './tab-layout';

const MoreSheet = lazy(() => import('./more-sheet'));

const TAB_CLASS =
  'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground';

/**
 * The phone's navigation: the screens along the bottom, where a thumb reaches.
 *
 * It sits above the home bar rather than under it (`env(safe-area-inset-
 * bottom)`), and every tab is at least 56 pixels tall, because a target
 * smaller than a fingertip is a target that gets hit by mistake.
 *
 * Up to five screens are five tabs. From six, the first four are tabs and the
 * fifth is More, which opens a sheet from the bottom listing the rest; More is
 * lit while the screen being shown is one of those (see tab-layout.ts).
 */
export function TabBar({ role }: { role: Role | undefined }) {
  const { tabs, more } = tabBarLayout(visibleScreens(role));
  return (
    <nav
      aria-label={t('nav.primary')}
      className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {tabs.map((screen) => (
        <Tab key={screen.to} screen={screen} />
      ))}
      {more.length > 0 && <MoreTab screens={more} />}
    </nav>
  );
}

function Tab({ screen }: { screen: Screen }) {
  const Icon = screen.icon;
  return (
    <Link
      to={screen.to}
      activeOptions={{ exact: screen.to === '/' }}
      className={TAB_CLASS}
      activeProps={{ className: 'text-primary', 'aria-current': 'page' }}
    >
      <Icon className="size-5" aria-hidden />
      {screenLabel(screen)}
    </Link>
  );
}

function MoreTab({ screens }: { screens: Screen[] }) {
  const [open, setOpen] = useState(false);
  // The sheet's code is fetched on the first tap and kept from then on.
  const [wanted, setWanted] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const current = screens.some(
    (screen) => pathname === screen.to || pathname.startsWith(`${screen.to}/`),
  );
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setWanted(true);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-current={current ? 'page' : undefined}
        className={`${TAB_CLASS} ${current ? 'text-primary' : ''}`}
      >
        <Ellipsis className="size-5" aria-hidden />
        {t('nav.more')}
      </button>
      {wanted && (
        <Suspense fallback={null}>
          <MoreSheet screens={screens} open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  );
}
