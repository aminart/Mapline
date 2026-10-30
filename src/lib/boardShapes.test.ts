// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { parseColor, simplify, sliceShapes, type Shape } from './boardShapes';

describe('board shapes for slides', () => {
  it('reads CSS colours, clear ones as none', () => {
    expect(parseColor('rgb(47, 85, 212)')).toEqual({ hex: '2F55D4', alpha: 1 });
    expect(parseColor('rgba(0, 0, 0, 0.5)')).toEqual({ hex: '000000', alpha: 0.5 });
    expect(parseColor('rgba(0, 0, 0, 0)')).toBeNull();
    expect(parseColor('#fbe9d9')).toEqual({ hex: 'FBE9D9', alpha: 1 });
  });

  it('keeps only the corners of an arrow', () => {
    const points = [0, 1, 2, 3, 4, 5].map((x) => ({ x: x * 10, y: 0 })).concat([1, 2, 3].map((y) => ({ x: 50, y: y * 10 })));
    expect(simplify(points)).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 30 },
    ]);
  });

  it('cuts the board into the persona column and one phase', () => {
    const box = (x: number, w: number, y = 50): Shape => ({ kind: 'box', x, y, w, h: 20, fill: { hex: 'FFFFFF', alpha: 1 }, line: { color: { hex: '000000', alpha: 1 }, width: 1, dash: false }, radius: 4, ellipse: false });
    const text = (x: number): Shape => ({ kind: 'text', x, y: 60, w: 40, h: 10, text: 't', size: 12, color: { hex: '000000', alpha: 1 }, bold: false, italic: false, align: 'left', font: 'Inter', lineHeight: 16, wrap: true });
    const line: Shape = { kind: 'line', points: [{ x: 0, y: 80 }, { x: 600, y: 80 }], color: { hex: '2F55D4', alpha: 1 }, dash: true, width: 1, head: false };
    const parts = [
      { x0: 0, x1: 100 },
      { x0: 300, x1: 500 },
    ];
    const out = sliceShapes([box(0, 600), box(10, 80), box(310, 80), box(150, 80), text(320), text(150), line], parts, 40);
    const boxes = out.filter((s) => s.kind === 'box');
    // The board, cut in two without its outline; the persona card; the card of the phase, moved left.
    expect(boxes.map((b) => [b.x, b.w, b.line ? 1 : 0])).toEqual([
      [0, 100, 0],
      [10, 80, 1],
      [100, 200, 0],
      [110, 80, 1],
    ]);
    expect(out.filter((s) => s.kind === 'text').map((s) => s.x)).toEqual([120]);
    expect(out.filter((s) => s.kind === 'line').map((s) => s.kind === 'line' && s.points.map((p) => p.x))).toEqual([
      [0, 100],
      [100, 300],
    ]);
    expect(boxes[1].y).toBe(10);
  });
});
