// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { midpoint, roundedPath, routeArrow, type Rect } from './arrows';

const gaps = { col: 12, row: 28 };
const W = 184;
const H = 120;
/** Box at grid position (row, col), as laid out on the board. */
const cell = (row: number, col: number): Rect => ({ x: col * (W + gaps.col), y: row * (H + gaps.row), w: W, h: H });

function crosses(points: [number, number][], box: Rect): boolean {
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    if (maxX > box.x + 0.5 && minX < box.x + box.w - 0.5 && maxY > box.y + 0.5 && minY < box.y + box.h - 0.5) return true;
  }
  return false;
}

describe('routeArrow', () => {
  it('goes straight between neighbours in a row', () => {
    expect(routeArrow(cell(0, 0), cell(0, 1), gaps)).toEqual([
      [W, H / 2],
      [W + gaps.col, H / 2],
    ]);
  });

  it('never crosses a box it skips', () => {
    const cases: [Rect, Rect][] = [
      [cell(0, 0), cell(0, 3)], // same row, far apart
      [cell(0, 3), cell(0, 0)],
      [cell(0, 1), cell(3, 1)], // same column, skipping rows
      [cell(0, 0), cell(3, 4)],
      [cell(3, 4), cell(0, 0)],
      [cell(2, 4), cell(0, 1)],
      [cell(0, 2), cell(1, 0)], // adjacent rows
    ];
    for (const [a, b] of cases) for (let lane = 0; lane < 5; lane++) {
      const pts = routeArrow(a, b, gaps, lane);
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 5; c++) {
          const box = cell(r, c);
          if ((box.x === a.x && box.y === a.y) || (box.x === b.x && box.y === b.y)) continue;
          expect(crosses(pts, box), `route ${JSON.stringify(pts)} crosses (${r},${c})`).toBe(false);
        }
      }
    }
  });

  it('never crosses a card when a cell holds two alternatives', () => {
    // Cell (1, 1) holds two cards, one above the other, separated by a small gap.
    const split = cell(1, 1);
    const half = (split.h - 18) / 2;
    const top: Rect = { ...split, h: half };
    const bottom: Rect = { ...split, y: split.y + half + 18, h: half };
    const cards: { box: Rect; cell: Rect }[] = [top, bottom].map((box) => ({ box, cell: split }));
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (r !== 1 || c !== 1) cards.push({ box: cell(r, c), cell: cell(r, c) });
    for (const from of cards) {
      for (const to of cards) {
        if (from === to) continue;
        for (let lane = 0; lane < 3; lane++) {
          const pts = routeArrow(from.box, to.box, gaps, lane, from.cell, to.cell);
          for (const other of cards) {
            if (other === from || other === to) continue;
            expect(crosses(pts, other.box), `route ${JSON.stringify(pts)} crosses ${JSON.stringify(other.box)}`).toBe(false);
          }
          // It starts and ends on the edges of the two cards.
          const [sx, sy] = pts[0];
          const [ex, ey] = pts[pts.length - 1];
          const onEdge = (x: number, y: number, b: Rect) =>
            x >= b.x - 0.5 && x <= b.x + b.w + 0.5 && y >= b.y - 0.5 && y <= b.y + b.h + 0.5 &&
            (Math.abs(x - b.x) < 0.5 || Math.abs(x - b.x - b.w) < 0.5 || Math.abs(y - b.y) < 0.5 || Math.abs(y - b.y - b.h) < 0.5);
          expect(onEdge(sx, sy, from.box)).toBe(true);
          expect(onEdge(ex, ey, to.box)).toBe(true);
          expect(crosses(pts, { ...from.box, x: from.box.x + 1, w: from.box.w - 2, y: from.box.y + 1, h: from.box.h - 2 })).toBe(false);
          expect(crosses(pts, { ...to.box, x: to.box.x + 1, w: to.box.w - 2, y: to.box.y + 1, h: to.box.h - 2 })).toBe(false);
        }
      }
    }
  });

  it('keeps an incoming and an outgoing arrow apart on the same edge', () => {
    const into = routeArrow(cell(0, 2), cell(1, 2), gaps);
    const out = routeArrow(cell(1, 2), cell(0, 3), gaps);
    expect(into[into.length - 1][0]).not.toBe(out[0][0]);
  });

  it('ends on the edge of the target box', () => {
    const b = cell(2, 3);
    const pts = routeArrow(cell(0, 0), b, gaps);
    const [x, y] = pts[pts.length - 1];
    expect(y).toBe(b.y);
    expect(x).toBeGreaterThan(b.x);
    expect(x).toBeLessThan(b.x + W);
  });
});

describe('roundedPath', () => {
  it('rounds corners and keeps the end point', () => {
    const d = roundedPath([
      [0, 0],
      [0, 50],
      [100, 50],
    ]);
    expect(d.startsWith('M0 0')).toBe(true);
    expect(d).toContain('Q0 50');
    expect(d.endsWith('L100 50')).toBe(true);
  });
});

describe('midpoint', () => {
  it('finds the halfway point along the segments', () => {
    expect(midpoint([[0, 0], [0, 10], [30, 10]])).toEqual({ x: 10, y: 10 });
    expect(midpoint([[5, 5], [5, 5]])).toEqual({ x: 5, y: 5 });
  });
});
