// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import type { Link } from '../model/types';
import type { Rect } from './arrows';
import { routeMap, type MapCard, type MapLayout } from './mapRoute';

const gaps = { col: 12, row: 28 };
const W = 184;
const H = 120;
const COLS = 5;
const ROWS = 4;
const cellAt = (row: number, col: number): Rect => ({ x: 20 + col * (W + gaps.col), y: row * (H + gaps.row), w: W, h: H });

/** A map with a card in each listed cell; the other cells are empty. */
function layout(filled: [number, number][], extra: MapCard[] = []): MapLayout {
  const cards: MapCard[] = filled.map(([r, c]) => ({ id: `${r}-${c}`, box: cellAt(r, c), cell: cellAt(r, c) })).concat(extra);
  const empty: Rect[] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!cards.some((k) => k.cell.x === cellAt(r, c).x && k.cell.y === cellAt(r, c).y)) empty.push(cellAt(r, c));
  return {
    cards,
    obstacles: empty,
    columns: Array.from({ length: COLS }, (_, c) => ({ x: cellAt(0, c).x, w: W })),
    rows: Array.from({ length: ROWS }, (_, r) => ({ y: cellAt(r, 0).y, h: H })),
    gaps,
    width: 20 + COLS * (W + gaps.col),
    height: ROWS * (H + gaps.row) - gaps.row,
  };
}

const link = (from: string, to: string, more: Partial<Link> = {}): Link => ({ id: `${from}>${to}`, from, to, ...more });

function crosses(points: [number, number][], box: Rect): boolean {
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    if (Math.max(x1, x2) > box.x + 0.5 && Math.min(x1, x2) < box.x + box.w - 0.5 && Math.max(y1, y2) > box.y + 0.5 && Math.min(y1, y2) < box.y + box.h - 0.5) return true;
  }
  return false;
}

const bends = (points: unknown[]) => points.length - 2;

describe('routeMap', () => {
  it('goes straight between neighbours in a row', () => {
    const routes = routeMap([link('0-0', '0-1')], layout([[0, 0], [0, 1]]));
    expect(routes.get('0-0>0-1')).toEqual([
      [20 + W, H / 2],
      [20 + W + gaps.col, H / 2],
    ]);
  });

  it('goes straight down between cards of a column', () => {
    const pts = routeMap([link('0-1', '1-1')], layout([[0, 1], [1, 1]])).get('0-1>1-1')!;
    expect(pts).toHaveLength(2);
    expect(pts[0][0]).toBe(pts[1][0]);
  });

  it('reaches a card in the next row and column with two bends, through the row gap', () => {
    const pts = routeMap([link('0-1', '1-2')], layout([[0, 1], [1, 2]])).get('0-1>1-2')!;
    expect(bends(pts)).toBe(2);
    // Out of the bottom, in through the top: the row gap is wider than the column gap.
    expect(pts[0][1]).toBe(cellAt(0, 1).y + H);
    expect(pts[pts.length - 1][1]).toBe(cellAt(1, 2).y);
  });

  it('never crosses a card or an empty cell, and stays inside the map', () => {
    const filled: [number, number][] = [[0, 0], [0, 1], [0, 3], [1, 1], [1, 2], [2, 3], [3, 0], [3, 4], [2, 0]];
    const l = layout(filled);
    const links = [link('0-0', '2-3'), link('2-3', '0-0'), link('0-0', '0-3'), link('3-4', '0-1'), link('1-2', '3-0'), link('3-0', '3-4'), link('0-3', '1-1'), link('2-0', '0-0')];
    const routes = routeMap(links, l);
    expect(routes.size).toBe(links.length);
    for (const lk of links) {
      const pts = routes.get(lk.id)!;
      for (const c of l.cards) {
        if (c.id === lk.from || c.id === lk.to) continue;
        expect(crosses(pts, c.box), `${lk.id} ${JSON.stringify(pts)} crosses ${c.id}`).toBe(false);
      }
      for (const e of l.obstacles) expect(crosses(pts, e), `${lk.id} crosses an empty cell`).toBe(false);
      for (const [x, y] of pts) {
        expect(x).toBeGreaterThanOrEqual(l.columns[0].x - gaps.col / 2);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(l.height);
      }
    }
  });

  it('keeps clear of both alternatives of a split cell and of the word between them', () => {
    const split = cellAt(1, 1);
    const half = (H - 18) / 2;
    const top: MapCard = { id: 'top', box: { ...split, h: half }, cell: split };
    const bottom: MapCard = { id: 'bottom', box: { ...split, y: split.y + half + 18, h: half }, cell: split };
    const word: Rect = { x: split.x + W / 2 - 10, y: split.y + half, w: 20, h: 18 };
    const l = layout([[0, 0], [1, 2], [2, 1]], [top, bottom]);
    l.obstacles.push(word);
    const links = [link('top', 'bottom'), link('0-0', 'bottom'), link('top', '1-2'), link('2-1', 'top')];
    const routes = routeMap(links, l);
    for (const lk of links) {
      const pts = routes.get(lk.id)!;
      expect(crosses(pts, word), `${lk.id} crosses the word`).toBe(false);
      for (const c of l.cards) if (c.id !== lk.from && c.id !== lk.to) expect(crosses(pts, c.box), `${lk.id} crosses ${c.id}`).toBe(false);
    }
  });

  it('leaves and enters by the sides asked for', () => {
    const l = layout([[0, 0], [0, 1]]);
    const pts = routeMap([link('0-0', '0-1', { fromSide: 'bottom', toSide: 'bottom' })], l).get('0-0>0-1')!;
    const [a, b] = [cellAt(0, 0), cellAt(0, 1)];
    expect(pts[0][1]).toBe(a.y + a.h);
    expect(pts[pts.length - 1][1]).toBe(b.y + b.h);
    // Under the row, and back up.
    expect(Math.max(...pts.map((p) => p[1]))).toBeGreaterThan(a.y + a.h);
    // One side asked for, the other still chosen.
    const top = routeMap([link('1-0', '1-1', { toSide: 'top' })], layout([[1, 0], [1, 1]])).get('1-0>1-1')!;
    expect(top[top.length - 1][1]).toBe(cellAt(1, 1).y);
  });

  it('treats a side it does not know as automatic', () => {
    const odd = { ...link('0-0', '0-1'), fromSide: 'middle' } as unknown as Link;
    expect(routeMap([odd], layout([[0, 0], [0, 1]])).get('0-0>0-1')).toHaveLength(2);
  });

  it('gives arrows sharing a side ports of their own', () => {
    const routes = routeMap([link('0-1', '1-1'), link('0-1', '1-0'), link('0-1', '1-2')], layout([[0, 1], [1, 0], [1, 1], [1, 2]]));
    const starts = [...routes.values()].map((p) => p[0][0]);
    expect(new Set(starts).size).toBe(3);
  });
});
