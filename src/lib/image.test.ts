// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { alphaBelowFull } from './image';

describe('image transparency', () => {
  it('tells opaque pixels from see-through ones', () => {
    expect(alphaBelowFull(new Uint8ClampedArray([10, 20, 30, 255, 0, 0, 0, 255]))).toBe(false);
    expect(alphaBelowFull(new Uint8ClampedArray([10, 20, 30, 255, 0, 0, 0, 128]))).toBe(true);
  });
});
