import { Link } from '@tanstack/react-router';
import type { Role } from '@shared/schemas';
import { t } from '@/lib/i18n';
import { screenLabel, visibleScreens } from './navigation';

/**
 * The phone's navigation: the screens along the bottom, where a thumb reaches.
 *
 * It sits above the home bar rather than under it (`env(safe-area-inset-
 * bottom)`), and every tab is at least 56 pixels tall, because a target
 * smaller than a fingertip is a target that gets hit by mistake.
 */
export function TabBar({ role }: { role: Role | undefined }) {
  const items = visibleScreens(role);
  return (
    <nav
      aria-label={t('nav.primary')}
      className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((screen) => {
        const Icon = screen.icon;
        return (
          <Link
            key={screen.to}
            to={screen.to}
            activeOptions={{ exact: screen.to === '/' }}
            className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"
            activeProps={{ className: 'text-primary', 'aria-current': 'page' }}
          >
            <Icon className="size-5" aria-hidden />
            {screenLabel(screen)}
          </Link>
        );
      })}
    </nav>
  );
}
