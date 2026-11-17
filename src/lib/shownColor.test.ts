// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { darkPaletteCss, shown, shownBox, themable } from './shownColor';
import { BORDER_SWATCHES, CHOICE_STYLE, FILL_SWATCHES, LINK_COLORS, PERSONA_PALETTE, TAG_PALETTE, TEXT_SWATCHES, defaultStyle } from '../model/theme';
import type { BoxKind } from '../model/types';

const KINDS: BoxKind[] = ['obj', 'phase', 'step', 'scene', 'persona', 'act', 'info', 'identity', 'block', 'node'];

describe('colours in the dark theme', () => {
  it('gives every default box, swatch, tag and tint a dark counterpart', () => {
    for (const kind of KINDS) expect(themable(defaultStyle(kind).bg, 'bg'), kind).toBe(true);
    for (const kind of KINDS) expect(themable(defaultStyle(kind).color, 'ink'), kind).toBe(kind !== 'obj');
    for (const hex of FILL_SWATCHES) expect(themable(hex, 'bg'), hex).toBe(true);
    for (const hex of BORDER_SWATCHES) expect(themable(hex, 'line') || themable(hex, 'bg'), hex).toBe(true);
    for (const hex of TEXT_SWATCHES.filter((h) => h !== '#FFFFFF')) expect(themable(hex, 'ink'), hex).toBe(true);
    for (const { bg, fg } of TAG_PALETTE) expect(themable(bg, 'bg') && themable(fg, 'ink'), bg).toBe(true);
    for (const { tint } of PERSONA_PALETTE) expect(themable(tint, 'bg'), tint).toBe(true);
    expect(themable(CHOICE_STYLE.bg, 'bg')).toBe(true);
    expect(themable(LINK_COLORS[0], 'line')).toBe(true);
  });

  it('shows a palette colour through a variable that falls back on the colour itself', () => {
    expect(shown('#FFFFFF', 'bg')).toBe('var(--mcb-ffffff, #FFFFFF)');
    expect(shown('#ffffff', 'bg')).toBe('var(--mcb-ffffff, #ffffff)');
    expect(shown('#12AB34', 'bg')).toBe('#12AB34');
    expect(shown(undefined, 'ink')).toBeUndefined();
  });

  it("keeps a box of the user's own fill as it is, text included", () => {
    expect(shownBox('#FFD6E8', '#DDE1E7', '#191B20')).toEqual({ bg: '#FFD6E8', bc: '#DDE1E7', color: '#191B20' });
    const palette = shownBox('#FFF4C2', '#DDE1E7', '#191B20');
    expect(palette.bg).toContain('--mcb-fff4c2');
    expect(palette.bc).toContain('--mcl-dde1e7');
    expect(palette.color).toContain('--mci-191b20');
  });

  it('keeps a border the colour of its fill with the fill', () => {
    // The objective: black fill and border; the border must not turn light.
    expect(shownBox('#191B20', '#191B20', '#FFFFFF')).toEqual({ bg: 'var(--mcb-191b20, #191B20)', bc: 'var(--mcb-191b20, #191B20)', color: '#FFFFFF' });
  });

  it('sets the variables in the dark theme only, and clears them on an exported board', () => {
    const css = darkPaletteCss();
    expect(css).toMatch(/^:root\[data-theme='dark'\]\{[^}]*--mcb-ffffff:#1C2038;/);
    expect(css).toMatch(/\.is-exporting\{[^}]*--mcb-ffffff:initial;/);
  });
});
