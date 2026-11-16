// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { exampleBlueprint } from './fixtures';
import { projectFromMap } from './project';
import { parse, serialize } from './serialize';
import { cssColorToHex, hideUsedColor, showUsedColor, usedColors } from './usedColors';
import type { Project } from './types';

function project(): Project {
  const map = exampleBlueprint();
  map.styles = { obj: { bg: '#ffeedd', color: '#123456' }, 'step:a': { bg: '#FFEEDD', bc: '#00AA00' } };
  map.links = [{ id: 'l', from: 'x', to: 'y', color: '#00aa00' }];
  return projectFromMap('Test', map);
}

describe('used colours', () => {
  it('reads CSS colours as #RRGGBB, opaque only', () => {
    expect(cssColorToHex('#abc')).toBe('#AABBCC');
    expect(cssColorToHex('#a1b2c3')).toBe('#A1B2C3');
    expect(cssColorToHex('#a1b2c3ff')).toBe('#A1B2C3');
    expect(cssColorToHex('#a1b2c380')).toBeNull();
    expect(cssColorToHex('rgb(255, 0, 128)')).toBe('#FF0080');
    expect(cssColorToHex('rgb(255 0 128 / 1)')).toBe('#FF0080');
    expect(cssColorToHex('rgba(0, 0, 0, 0)')).toBeNull();
    expect(cssColorToHex('transparent')).toBeNull();
  });

  it('lists the colours set in the project, the most used first', () => {
    expect(usedColors(project())).toEqual(['#FFEEDD', '#00AA00', '#123456']);
  });

  it('takes a colour off the shortcuts without changing what it colours, and offers it again', () => {
    const p = project();
    const hidden = hideUsedColor(p, '#ffeedd');
    expect(usedColors(hidden)).toEqual(['#00AA00', '#123456']);
    expect(hidden.docs).toBe(p.docs);
    expect(hideUsedColor(hidden, '#FFEEDD')).toBe(hidden);
    expect(usedColors(showUsedColor(hidden, '#FFEEDD'))).toEqual(usedColors(p));
    expect(showUsedColor(hidden, '#FFEEDD')).not.toHaveProperty('hiddenColors');
    expect(showUsedColor(p, '#FFEEDD')).toBe(p);
  });

  it('keeps the removed shortcuts in the file', () => {
    const hidden = hideUsedColor(project(), '#123456');
    expect(parse(serialize(hidden)).hiddenColors).toEqual(['#123456']);
    expect(parse(serialize(project()))).not.toHaveProperty('hiddenColors');
  });
});
