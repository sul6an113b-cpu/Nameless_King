/**
 * Light/dark theme: follows `prefers-color-scheme` until the user picks one with the toggle; the choice is
 * remembered per browser. Applied as `data-theme` on <html>, which the CSS custom properties key on.
 */
import { useSyncExternalStore } from 'react';
import { useUiStore, type ThemeChoice } from '../state/ui.ts';

const KEY = 'looplab.theme';
const QUERY = '(prefers-color-scheme: dark)';

export function readThemeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // storage blocked (private mode): the choice lasts for this session only
  }
}

const media = (): MediaQueryList | null => (typeof matchMedia === 'function' ? matchMedia(QUERY) : null);

function useSystemDark(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = media();
      m?.addEventListener('change', cb);
      return () => m?.removeEventListener('change', cb);
    },
    () => media()?.matches ?? false,
  );
}

/** The theme actually shown. */
export function useEffectiveTheme(): 'light' | 'dark' {
  const choice = useUiStore((s) => s.theme);
  const systemDark = useSystemDark();
  return choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;
}
