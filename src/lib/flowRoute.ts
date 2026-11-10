// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Flow, FlowLink, FlowNode, Id } from '../model/types';
import { FLOW, cellBox, nodeBox, type Box, type FlowLayout } from '../model/flowLayout';
import { horizontal, routeOrthogonal, simplify, type Point, type Side } from './orthoRoute';


/** Offsets that keep arrows sharing a gap on distinct lanes. */
const LANES = [0, -6, 6, -12, 12];
/** Space between arrows leaving or entering the same side of a card. */
const PORT_GAP = 14;

/** Which sides of the two cards an arrow leaves and enters by. */
function sides(a: FlowNode, b: FlowNode): [Side, Side] {
  if (b.col > a.col) return ['right', 'left'];
  if (b.col < a.col) return b.row <= a.row ? ['top', 'top'] : ['bottom', 'bottom'];
  return b.row > a.row ? ['bottom', 'top'] : ['top', 'bottom'];
}

/** The point on a card's side, `offset` along it from the middle. */
function port(node: FlowNode, side: Side, wanted: number, layout?: FlowLayout): Point {
  const b = nodeBox(node, layout);
  // Kept on the card, away from its corners.
  const half = (horizontal(side) ? b.h : b.w) / 2 - 8;
  const offset = Math.max(-half, Math.min(half, wanted));
  switch (side) {
    case 'top':
      return [b.x + b.w / 2 + offset, b.y];
    case 'bottom':
      return [b.x + b.w / 2 + offset, b.y + b.h];
    case 'left':
      return [b.x, b.y + b.h / 2 + offset];
    case 'right':
      return [b.x + b.w, b.y + b.h / 2 + offset];
  }
}

/** The gap just outside a cell's side: x of a column gap, or y of a row gap. */
function gapBeside(node: FlowNode, side: Side, layout?: FlowLayout): number {
  const c = cellBox(node.col, node.row, layout);
  switch (side) {
    case 'top':
      return c.y - FLOW.gapY / 2;
    case 'bottom':
      return c.y + c.h + FLOW.gapY / 2;
    case 'left':
      return c.x - FLOW.gapX / 2;
    case 'right':
      return c.x + c.w + FLOW.gapX / 2;
  }
}


/**
 * Orthogonal route from card `a` to card `b`. Arrows leave forward cards by
 * the right and enter by the left; arrows going back loop over (or under)
 * the flow. Between the cards they travel in the gaps between rows and
 * columns, which no card ever occupies, so they never cross a card; a
 * straight line through empty cells is used when there is one.
 */
function fallbackRoute(
  a: FlowNode,
  b: FlowNode,
  occupied: (col: number, row: number) => boolean,
  opts: { lane?: number; fromOffset?: number; toOffset?: number; layout?: FlowLayout } = {},
): Point[] {
  const { layout } = opts;
  const beside = (node: FlowNode, side: Side) => gapBeside(node, side, layout);
  const lane = LANES[(opts.lane ?? 0) % LANES.length];
  const [out, into] = sides(a, b);
  const p0 = port(a, out, opts.fromOffset ?? 0, layout);
  const q0 = port(b, into, opts.toOffset ?? 0, layout);
  const clearRow = (row: number, from: number, to: number) => {
    for (let c = Math.min(from, to) + 1; c < Math.max(from, to); c++) if (occupied(c, row)) return false;
    return true;
  };
  const clearCol = (col: number, from: number, to: number) => {
    for (let r = Math.min(from, to) + 1; r < Math.max(from, to); r++) if (occupied(col, r)) return false;
    return true;
  };

  // Straight runs, and one bend through empty cells.
  if (out === 'right') {
    if (a.row === b.row && clearRow(a.row, a.col, b.col)) {
      if (Math.abs(p0[1] - q0[1]) < 0.5) return [p0, q0];
      // Ports at different heights: a step in the gap before `b`.
      const g = beside(b, 'left') + lane;
      return simplify([p0, [g, p0[1]], [g, q0[1]], q0]);
    }
    if (a.row !== b.row) {
      const beforeB = beside(b, 'left') + lane;
      if (clearRow(a.row, a.col, b.col) && b.col > a.col) return simplify([p0, [beforeB, p0[1]], [beforeB, q0[1]], q0]);
      const afterA = beside(a, 'right') + lane;
      if (clearRow(b.row, a.col, b.col)) return simplify([p0, [afterA, p0[1]], [afterA, q0[1]], q0]);
    }
  }
  if (a.col === b.col && clearCol(a.col, a.row, b.row)) {
    if (Math.abs(p0[0] - q0[0]) < 0.5) return [p0, q0];
    const g = beside(b, b.row > a.row ? 'top' : 'bottom') + lane;
    return simplify([p0, [p0[0], g], [q0[0], g], q0]);
  }

  // Through the gaps: out into the gap beside `a`, along gaps, into the gap beside `b`.
  const g1 = beside(a, out) + lane;
  const g2 = beside(b, into) + lane;
  const p1: Point = horizontal(out) ? [g1, p0[1]] : [p0[0], g1];
  const q1: Point = horizontal(into) ? [g2, q0[1]] : [q0[0], g2];
  let middle: Point[];
  if (horizontal(out) && horizontal(into)) {
    // Both in column gaps: cross over along the row gap next to `b`, on `a`'s side.
    const y = (b.row > a.row ? beside(b, 'top') : b.row < a.row ? beside(b, 'bottom') : beside(b, 'top')) + lane;
    middle = p1[0] === q1[0] ? [] : [[p1[0], y], [q1[0], y]];
  } else if (!horizontal(out) && !horizontal(into)) {
    // Both in row gaps: cross over along a column gap beside `a`.
    if (Math.abs(p1[1] - q1[1]) < 0.5) middle = [];
    else {
      const x = (b.col < a.col ? beside(a, 'left') : beside(a, 'right')) + lane;
      middle = [[x, p1[1]], [x, q1[1]]];
    }
  } else if (horizontal(out)) {
    middle = [[p1[0], q1[1]]];
  } else {
    middle = [[q1[0], p1[1]]];
  }
  return simplify([p0, p1, ...middle, q1, q0]);
}

export interface RoutedLink {
  link: FlowLink;
  points: Point[];
}

/** Space kept between an arrow and a card it passes. */
const CLEAR = 6;
/** Lanes tried in each gap, so arrows sharing a gap can run side by side. */
const GAP_LANES = [0, -7, 7];
const STYLE = { clear: CLEAR, xLanes: GAP_LANES, yLanes: GAP_LANES, minOut: 10, minIn: 16, portGap: PORT_GAP };

/**
 * Routes every arrow of a flow by the most direct way that crosses no card
 * (see routeOrthogonal), the arrows that find none the old way.
 */
export function routeFlow(flow: Flow, layout?: FlowLayout): RoutedLink[] {
  // Routing tries many paths: the routes are kept while the cards and arrows stay put, labels and colours aside.
  const key = JSON.stringify([
    flow.nodes.map((n) => [n.id, n.col, n.row, n.kind, nodeBox(n, layout)]),
    flow.links.map((l) => [l.id, l.from, l.to, l.fromSide, l.toSide]),
    layout?.rows,
  ]);
  let routes = cache.get(key);
  if (routes) {
    cache.delete(key);
  } else {
    routes = computeRoutes(flow, layout);
    if (cache.size >= 16) cache.delete(cache.keys().next().value!);
  }
  cache.set(key, routes);
  const r = routes;
  return flow.links.filter((l) => r.has(l.id)).map((l) => ({ link: l, points: r.get(l.id)! }));
}

const cache = new Map<string, Map<Id, Point[]>>();

function computeRoutes(flow: Flow, layout?: FlowLayout): Map<Id, Point[]> {
  const byId = new Map<Id, FlowNode>(flow.nodes.map((n) => [n.id, n]));
  const links = flow.links.filter((l) => byId.has(l.from) && byId.has(l.to) && l.from !== l.to);
  if (!links.length) return new Map();
  const boxes = new Map<Id, Box>(flow.nodes.map((n) => [n.id, nodeBox(n, layout)]));
  const cols = Math.max(...flow.nodes.map((n) => n.col)) + 1;
  const rows = Math.max(...flow.nodes.map((n) => n.row)) + 1;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let c = 0; c <= cols; c++) xs.push(cellBox(c, 0, layout).x - FLOW.gapX / 2);
  for (let r = 0; r < rows; r++) ys.push(cellBox(0, r, layout).y - FLOW.gapY / 2);
  const last = cellBox(0, rows - 1, layout);
  ys.push(last.y + last.h + FLOW.gapY / 2);
  const distance = (from: Id, to: Id) => {
    const a = byId.get(from)!;
    const b = byId.get(to)!;
    return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
  };
  const routed = routeOrthogonal(links, { boxes, xs, ys, beside: (id, side) => gapBeside(byId.get(id)!, side, layout), distance }, STYLE);
  // The old way, for the arrows that found none.
  const routes = new Map<Id, Point[]>();
  for (const l of links) {
    routes.set(l.id, routed.get(l.id) ?? fallbackRoute(byId.get(l.from)!, byId.get(l.to)!, (col, row) => flow.nodes.some((n) => n.col === col && n.row === row), { layout }));
  }
  return routes;
}
