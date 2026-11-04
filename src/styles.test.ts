// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dir = new URL('./styles/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.css'));
const imported = [...readFileSync(new URL('./styles.css', import.meta.url), 'utf8').matchAll(/@import '\.\/styles\/(.+?)';/g)].map((m) => m[1]);

describe('style sheets', () => {
  it('loads every file of src/styles', () => {
    expect([...imported].sort()).toEqual([...files].sort());
  });

  // A rule left open makes the browser nest every rule after it inside it.
  it.each(files)('%s closes every rule it opens', (file) => {
    const css = readFileSync(new URL(file, dir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/'[^']*'|"[^"]*"/g, '');
    let depth = 0;
    for (const c of css) {
      if (c === '{') depth++;
      if (c === '}') depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });
});
