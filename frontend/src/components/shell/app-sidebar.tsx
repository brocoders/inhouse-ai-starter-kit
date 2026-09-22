import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Boxes } from 'lucide-react';
import type { Role } from '@shared/schemas';
import { screenLabel, visibleScreens } from './navigation';
import { t } from '@/lib/i18n';

/**
 * The desktop navigation: a fixed column, always there, never collapsing.
 *
 * A collapsible sidebar is a setting nobody changes and a state everybody has
 * to remember. These apps have five screens; the column costs 224 pixels and
 * saves a click on every one of them.
 */
export function AppSidebar({ role, footer }: { role: Role | undefined; footer?: ReactNode }) {
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r bg-card md:sticky md:top-0 md:flex md:h-dvh">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Boxes className="size-4" aria-hidden />
        </span>
        <span className="truncate font-semibold tracking-tight">{t('app.name')}</span>
      </div>
      <nav aria-label={t('nav.primary')} className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {visibleScreens(role).map((screen) => {
          const Icon = screen.icon;
          return (
            <Link
              key={screen.to}
              to={screen.to}
              activeOptions={{ exact: screen.to === '/' }}
              className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              activeProps={{
                className: 'bg-muted font-medium text-foreground',
                'aria-current': 'page',
              }}
            >
              <Icon className="size-4" aria-hidden />
              {screenLabel(screen)}
            </Link>
          );
        })}
      </nav>
      {footer && <div className="border-t p-2">{footer}</div>}
    </aside>
  );
}
