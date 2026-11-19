// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from 'vitest';
import { forgetRecent, recentFiles, recentFolder, rememberRecent, RECENT_MAX } from './recent';

// Tests run in Node: a small stand-in for the browser's storage.
const memory = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    clear: () => memory.clear(),
  },
});

describe('recent files', () => {
  beforeEach(() => localStorage.clear());

  it('keeps the last files first, each once, up to the limit', () => {
    rememberRecent('/a/un.mapline', 'Un', 1);
    rememberRecent('/a/deux.mapline', 'Deux', 2);
    rememberRecent('/a/un.mapline', 'Un bis', 3);
    expect(recentFiles().map((r) => r.title)).toEqual(['Un bis', 'Deux']);
    for (let i = 0; i < RECENT_MAX + 2; i++) rememberRecent(`/b/${i}.mapline`, `F${i}`, 10 + i);
    expect(recentFiles()).toHaveLength(RECENT_MAX);
  });

  it('forgets a file, and reads a damaged list as empty', () => {
    rememberRecent('/a/un.mapline', 'Un');
    forgetRecent('/a/un.mapline');
    expect(recentFiles()).toEqual([]);
    localStorage.setItem('mapline:recent', '{oops');
    expect(recentFiles()).toEqual([]);
  });

  it('shows the folder, shortened from the left', () => {
    expect(recentFolder('C:\\Users\\albane\\Projets\\carte.mapline')).toBe('C:\\Users\\albane\\Projets');
    expect(recentFolder('/x/' + 'y'.repeat(60) + '/z.mapline', 20)).toMatch(/^….{19}$/);
  });
});
