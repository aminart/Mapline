// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { isDesktop } from './fileio';

/** The interface's look: light, dark, or as the system is set. */
export type ThemePref = 'light' | 'dark' | 'system';

const KEY = 'missionmap:theme';

export function initialTheme(): ThemePref {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    // Storage unavailable: as the system is set.
  }
  return 'system';
}

function systemDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

let current: ThemePref = 'system';
let watching = false;

/** Light or dark, as shown now. */
export function shownTheme(pref: ThemePref = current): 'light' | 'dark' {
  return pref === 'system' ? (systemDark() ? 'dark' : 'light') : pref;
}

/**
 * Shows the interface in `pref`. The page always carries data-theme="light"
 * or "dark", so the style sheets need only one rule for each (see theme.css);
 * with "system", it follows the system while the app is open.
 * Exports stay light whatever the theme (see .is-exporting in theme.css).
 */
export function applyTheme(pref: ThemePref, remember = false) {
  current = pref;
  document.documentElement.setAttribute('data-theme', shownTheme(pref));
  if (remember) {
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      // Not critical: the choice lasts until the app is closed.
    }
  }
  if (!watching && typeof window !== 'undefined' && window.matchMedia) {
    watching = true;
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (current === 'system') document.documentElement.setAttribute('data-theme', shownTheme());
    });
  }
  // The window's own title bar (Windows, macOS) follows too.
  if (isDesktop) {
    import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(pref === 'system' ? null : pref))
      .catch(() => {});
  }
}
