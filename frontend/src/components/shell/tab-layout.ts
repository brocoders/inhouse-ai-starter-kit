// How the phone's tab bar divides the screens between the bar and "More".
//
// A bar holds five things a thumb can tell apart; the first real app on the
// kit reached eight screens and they overlapped. So: up to five screens are
// five tabs, and from six onwards the first four are tabs and the fifth is
// More, which opens the rest. The order of the screens list decides which
// come first — an app reorders one line to choose.
//
// Pure, with no imports, so it runs under `node --test` without a browser.
export const TAB_LIMIT = 5;

export function tabBarLayout<T>(screens: T[]): { tabs: T[]; more: T[] } {
  if (screens.length <= TAB_LIMIT) return { tabs: screens, more: [] };
  return { tabs: screens.slice(0, TAB_LIMIT - 1), more: screens.slice(TAB_LIMIT - 1) };
}
