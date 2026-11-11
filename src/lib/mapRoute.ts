// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Id, Link } from '../model/types';
import { routeArrow, type Gaps, type Rect } from './arrows';
import { routeOrthogonal, type Point, type RouteStyle, type Side } from './orthoRoute';

/** A map card as laid out: its box, and the grid cell holding it (two alternatives share one). */
export interface MapCard {
  id: Id;
  box: Rect;
  cell: Rect;
}

/** Where things sit on the map, as measured on screen. */
export interface MapLayout {
  cards: MapCard[];
  /** Other things an arrow must not run over, such as the word between two alternatives. */
  obstacles: Rect[];
  /** The activity columns, left to right, and the persona rows, top to bottom. */
  columns: { x: number; w: number }[];
  rows: { y: number; h: number }[];
  gaps: Gaps;
  /** Size of the drawing: arrows stay inside it, and right of the persona names. */
  width: number;
  height: number;
}

/** The map's gaps are narrow: arrows keep less room around the cards than in a flow. */
const STYLE: RouteStyle = { clear: 3, xLanes: [0, -3, 3], yLanes: [0, -5, 5], minOut: 6, minIn: 6, portGap: 12, stub: { below: 12, cost: 60 } };

const close = (a: number, b: number) => Math.abs(a - b) < 2;

/**
 * Routes every arrow of a map by the most direct way that crosses no card,
 * leaving and entering by the sides it asks for, if any (see
 * routeOrthogonal). An arrow that finds no such way goes through the gaps
 * the old way.
 */
export function routeMap(links: Link[], layout: MapLayout): Map<Id, Point[]> {
  const { gaps, columns, rows } = layout;
  const cards = new Map(layout.cards.map((c) => [c.id, c]));
  const boxes = new Map<Id, Rect>(layout.cards.map((c) => [c.id, c.box]));
  layout.obstacles.forEach((b, i) => boxes.set(`\u0000obstacle:${i}`, b));

  const xs: number[] = [];
  columns.forEach((c, i) => {
    if (i === 0) xs.push(c.x - gaps.col / 2);
    xs.push(c.x + c.w + gaps.col / 2);
  });
  // Between two rows a separator line can widen the gap: then the arrows keep to either side of it.
  const ys: number[] = [];
  const add = (y: number) => y > 0 && y < layout.height && !ys.some((v) => close(v, y)) && ys.push(y);
  rows.forEach((r) => {
    add(r.y - gaps.row / 2);
    add(r.y + r.h + gaps.row / 2);
  });
  ys.sort((a, b) => a - b);

  const beside = (id: Id, side: Side) => {
    const c = cards.get(id)!.cell;
    switch (side) {
      case 'top':
        return c.y - gaps.row / 2;
      case 'bottom':
        return c.y + c.h + gaps.row / 2;
      case 'left':
        return c.x - gaps.col / 2;
      case 'right':
        return c.x + c.w + gaps.col / 2;
    }
  };
  const left = columns.length ? columns[0].x - gaps.col / 2 : 0;
  const bounds = { x: left, y: 0, w: layout.width - left, h: layout.height };
  const routed = routeOrthogonal(links, { boxes, xs, ys, beside, bounds }, STYLE);
  const routes = new Map<Id, Point[]>();
  links.forEach((l, i) => {
    const a = cards.get(l.from);
    const b = cards.get(l.to);
    if (!a || !b) return;
    routes.set(l.id, routed.get(l.id) ?? routeArrow(a.box, b.box, gaps, i, a.cell, b.cell));
  });
  return routes;
}
