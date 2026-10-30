// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { fitImage } from './exportPptx';

describe('fitting a picture on a slide', () => {
  const box = { x: 1, y: 1, w: 10, h: 5 };
  it('fills the width of a wide picture and centres it vertically', () => {
    expect(fitImage(2000, 500, box)).toEqual({ x: 1, y: 2.25, w: 10, h: 2.5 });
  });
  it('fills the height of a tall picture and centres it horizontally', () => {
    expect(fitImage(500, 1000, box)).toEqual({ x: 4.75, y: 1, w: 2.5, h: 5 });
  });
});
