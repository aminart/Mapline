// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { contrast, paletteFromFill } from './color';
import { personaAccent, resolveStyle } from './theme';

describe('persona colours from a fill', () => {
  it('derives a readable accent and text for light and dark fills', () => {
    for (const fill of ['#FFF4C2', '#E3ECFF', '#DDF3E8', '#FFFFFF', '#191B20', '#2F55D4', '#7E22CE']) {
      const p = paletteFromFill(fill);
      expect(contrast(fill, p.text)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.accent, p.onAccent)).toBeGreaterThanOrEqual(3);
      expect(p.accent).not.toBe(fill);
    }
  });

  it('applies to the persona box and its cards unless overridden', () => {
    const style = resolveStyle('persona', { bg: '#191B20' }, 0);
    expect(style.color).toBe('#FFFFFF');
    expect(personaAccent(0, { bg: '#FFF4C2' }).accent).toBe(paletteFromFill('#FFF4C2').accent);
    expect(personaAccent(0, { bg: '#FFF4C2', bc: '#123456' }).accent).toBe('#123456');
    expect(resolveStyle('persona', { bg: '#191B20', color: '#FF0000' }, 0).color).toBe('#FF0000');
    expect(personaAccent(1, undefined).accent).toBe('#C2410C');
  });
});
