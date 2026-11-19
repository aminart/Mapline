// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

// The project files last opened or saved, for the start screen. Desktop only: a browser
// gives no path to open a file again.

const KEY = 'mapline:recent';
export const RECENT_MAX = 6;

export interface RecentFile {
  path: string;
  title: string;
  /** When it was last opened or saved (ms). */
  at: number;
}

export function recentFiles(): RecentFile[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(list)) return [];
    return list.filter((r): r is RecentFile => typeof r?.path === 'string' && typeof r?.title === 'string' && typeof r?.at === 'number');
  } catch {
    return [];
  }
}

function store(list: RecentFile[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    // Without storage, no list: nothing else depends on it.
  }
}

/** Puts a file first in the list (once). */
export function rememberRecent(path: string, title: string, at = Date.now()) {
  store([{ path, title, at }, ...recentFiles().filter((r) => r.path !== path)]);
}

/** Takes a file out of the list: moved or deleted since. */
export function forgetRecent(path: string) {
  store(recentFiles().filter((r) => r.path !== path));
}

/** The folder part of a path, shortened from the left, to tell two files of the same name apart. */
export function recentFolder(path: string, max = 48): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const dir = cut > 0 ? path.slice(0, cut) : '';
  return dir.length > max ? `…${dir.slice(dir.length - max + 1)}` : dir;
}
