import { Link } from '@tanstack/react-router';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { t } from '@/lib/i18n';
import { screenLabel, type Screen } from './navigation';

/**
 * The rest of the screens, from the bottom. Loaded the first time More is
 * tapped, not with the shell: the sheet primitive is the one piece of the
 * dialog machinery the first paint would otherwise carry on every visit.
 */
export default function MoreSheet({
  screens,
  open,
  onOpenChange,
}: {
  screens: Screen[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90dvh] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader>
          <SheetTitle>{t('nav.more')}</SheetTitle>
        </SheetHeader>
        <ul className="px-2 pb-2">
          {screens.map((screen) => {
            const Icon = screen.icon;
            return (
              <li key={screen.to}>
                <Link
                  to={screen.to}
                  activeOptions={{ exact: screen.to === '/' }}
                  className="flex min-h-12 items-center gap-3 rounded-md px-3 text-sm text-foreground hover:bg-muted"
                  activeProps={{ className: 'bg-muted font-medium', 'aria-current': 'page' }}
                  onClick={() => onOpenChange(false)}
                >
                  <Icon className="size-5 text-muted-foreground" aria-hidden />
                  {screenLabel(screen)}
                </Link>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
