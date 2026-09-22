import { Link } from '@tanstack/react-router';
import { Check, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import type { Me } from '@shared/schemas';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { signOut } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { useTheme, type ThemeChoice } from '@/lib/theme';
import { cn } from '@/lib/utils';

/** The initials on the avatar; a name nobody set falls back to a full stop. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '·';
  return parts
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

const themeOptions: Array<{
  value: ThemeChoice;
  labelKey: 'theme.light' | 'theme.dark' | 'theme.system';
  icon: typeof Sun;
}> = [
  { value: 'light', labelKey: 'theme.light', icon: Sun },
  { value: 'dark', labelKey: 'theme.dark', icon: Moon },
  { value: 'system', labelKey: 'theme.system', icon: Monitor },
];

/**
 * Who is signed in, and the three things that belong to them rather than to a
 * screen: their own record, how the app looks, and the way out.
 */
export function UserMenu({ me, className }: { me: Me | undefined; className?: string }) {
  const theme = useTheme();
  if (!me) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className={cn('h-auto max-w-full justify-start gap-2 px-2 py-1.5', className)}
          />
        }
      >
        <Avatar className="size-7">
          <AvatarFallback className="text-xs">{initials(me.name)}</AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-col items-start">
          <span className="w-full truncate text-sm font-medium">{me.name}</span>
          <span className="text-xs text-muted-foreground">{t(`role.${me.role}`)}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {me.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to="/account" />}>{t('nav.account')}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t('theme.label')}
        </DropdownMenuLabel>
        {themeOptions.map((option) => {
          const Icon = option.icon;
          return (
            <DropdownMenuItem
              key={option.value}
              closeOnClick={false}
              onClick={() => theme.set(option.value)}
            >
              <Icon className="size-4" aria-hidden />
              {t(option.labelKey)}
              {theme.choice === option.value && <Check className="ml-auto size-4" aria-hidden />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOut className="size-4" aria-hidden />
          {t('action.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
