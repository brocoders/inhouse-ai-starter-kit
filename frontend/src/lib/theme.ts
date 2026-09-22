// Light or dark, and remembering which. The choice is applied by the inline
// script in index.html before the first paint; this is the same decision, made
// again while the app is running.
import { useSyncExternalStore } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';

const KEY = 'theme';
const listeners = new Set<() => void>();

function read(): ThemeChoice {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'dark' || saved === 'light' ? saved : 'system';
  } catch {
    // A private window refuses storage. The system's choice still works.
    return 'system';
  }
}

let choice: ThemeChoice = read();

function resolve(next: ThemeChoice): 'light' | 'dark' {
  if (next !== 'system') return next;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply(next: ThemeChoice): void {
  document.documentElement.dataset.theme = resolve(next);
}

export function setTheme(next: ThemeChoice): void {
  choice = next;
  try {
    if (next === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // Not remembered between visits, but right for this one.
  }
  apply(next);
  for (const listener of listeners) listener();
}

/** The chosen setting and what it currently resolves to. */
export function useTheme(): {
  choice: ThemeChoice;
  resolved: 'light' | 'dark';
  set: (next: ThemeChoice) => void;
} {
  const value = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      // Following the system means following it as it changes, not only at
      // start-up: a phone that switches at sunset switches the app with it.
      const media = matchMedia('(prefers-color-scheme: dark)');
      const onSystemChange = () => {
        if (choice === 'system') {
          apply('system');
          listener();
        }
      };
      media.addEventListener('change', onSystemChange);
      return () => {
        listeners.delete(listener);
        media.removeEventListener('change', onSystemChange);
      };
    },
    () => `${choice}:${document.documentElement.dataset.theme ?? 'light'}`,
    () => 'system:light',
  );
  const [, resolved] = value.split(':');
  return {
    choice,
    resolved: resolved === 'dark' ? 'dark' : 'light',
    set: setTheme,
  };
}
