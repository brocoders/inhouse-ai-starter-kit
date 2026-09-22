// The screens, once. The sidebar on a desktop and the tab bar on a phone are
// two ways of showing this one list; adding a screen is one line here.
import { Activity, House, ListChecks, UserCircle, Users, type LucideIcon } from 'lucide-react';
import type { Role } from '@shared/schemas';
import { t } from '@/lib/i18n';
import type { TextKey } from '@/lib/i18n';

export type Screen = {
  to: string;
  labelKey: TextKey;
  icon: LucideIcon;
  /** Shown only to an owner. */
  ownerOnly?: boolean;
};

export const screens: Screen[] = [
  { to: '/', labelKey: 'nav.home', icon: House },
  { to: '/items', labelKey: 'nav.items', icon: ListChecks },
  { to: '/people', labelKey: 'nav.people', icon: Users },
  { to: '/system', labelKey: 'nav.health', icon: Activity, ownerOnly: true },
  { to: '/account', labelKey: 'nav.account', icon: UserCircle },
];

export function visibleScreens(role: Role | undefined): Screen[] {
  return screens.filter((screen) => !screen.ownerOnly || role === 'owner');
}

export function screenLabel(screen: Screen): string {
  return t(screen.labelKey);
}
