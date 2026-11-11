// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Flow, FlowLink, FlowNode, Id, LinkSide } from '../model/types';
import { FLOW, cellBox, nodeBox, type Box, type FlowLayout } from '../model/flowLayout';

export type Point = [number, number];
export type Side = LinkSide;

/** Offsets that keep arrows sharing a gap on distinct lanes. */
const LANES = [0, -6, 6, -12, 12];
/** Space between arrows leaving or entering the same side of a card. */
const PORT_GAP = 14;

const horizontal = (s: Side) => s === 'left' || s === 'right';

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


function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - p[0]) < 0.5 && Math.abs(last[1] - p[1]) < 0.5) continue;
    const prev = out[out.length - 2];
    if (prev && last && ((Math.abs(prev[0] - last[0]) < 0.5 && Math.abs(last[0] - p[0]) < 0.5) || (Math.abs(prev[1] - last[1]) < 0.5 && Math.abs(last[1] - p[1]) < 0.5))) {
      out[out.length - 1] = p;
      continue;
    }
    out.push(p);
  }
  return out;
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

export const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];
const NORMAL: Record<Side, Point> = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
/** Cost of a bend, in pixels of length: a longer route with fewer bends reads better. */
const BEND = 40;
/** Space kept between an arrow and a card it passes. */
const CLEAR = 6;
/** Lanes tried in each gap, so arrows sharing a gap can run side by side. */
const GAP_LANES = [0, -7, 7];
/** Shortest run out of a card, and into one (room for the arrowhead). */
const MIN_OUT = 10;
const MIN_IN = 16;

/** Where a port can sit along a side: kept away from the corners. */
function span(box: Box, side: Side): { lo: number; hi: number; mid: number } {
  const inset = 8;
  return horizontal(side) ? { lo: box.y + inset, hi: box.y + box.h - inset, mid: box.y + box.h / 2 } : { lo: box.x + inset, hi: box.x + box.w - inset, mid: box.x + box.w / 2 };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function portAt(box: Box, side: Side, along: number): Point {
  switch (side) {
    case 'top':
      return [along, box.y];
    case 'bottom':
      return [along, box.y + box.h];
    case 'left':
      return [box.x, along];
    case 'right':
      return [box.x + box.w, along];
  }
}

/** Does an axis-aligned segment enter the box grown by `m` (its border excluded)? */
function hits(p: Point, q: Point, b: Box, m: number): boolean {
  const x0 = b.x - m;
  const x1 = b.x + b.w + m;
  const y0 = b.y - m;
  const y1 = b.y + b.h + m;
  if (Math.abs(p[1] - q[1]) < 0.5) return p[1] > y0 + 0.5 && p[1] < y1 - 0.5 && Math.max(p[0], q[0]) > x0 + 0.5 && Math.min(p[0], q[0]) < x1 - 0.5;
  return p[0] > x0 + 0.5 && p[0] < x1 - 0.5 && Math.max(p[1], q[1]) > y0 + 0.5 && Math.min(p[1], q[1]) < y1 - 0.5;
}

const segLen = (p: Point, q: Point) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]);

function direction(p: Point, q: Point): Point {
  return [Math.sign(q[0] - p[0]), Math.sign(q[1] - p[1])];
}

/** Length, bends and short runs: what makes a route hard to follow. */
function baseCost(points: Point[]): number {
  let cost = 0;
  for (let i = 1; i < points.length; i++) {
    const l = segLen(points[i - 1], points[i]);
    cost += l;
    // A tiny jog reads as a glitch.
    if (i > 1 && i < points.length - 1 && l < 14) cost += 30;
  }
  return cost + (points.length - 2) * BEND;
}

/** Overlaps with and crossings of the arrows already placed. */
function clutter(points: Point[], placed: [Point, Point][], overlapWeight: number): number {
  let cost = 0;
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1];
    const q = points[i];
    const h = Math.abs(p[1] - q[1]) < 0.5;
    for (const [r, s] of placed) {
      const h2 = Math.abs(r[1] - s[1]) < 0.5;
      if (h === h2) {
        const a = h ? 1 : 0;
        const b = h ? 0 : 1;
        if (Math.abs(p[a] - r[a]) >= 4) continue;
        const overlap = Math.min(Math.max(p[b], q[b]), Math.max(r[b], s[b])) - Math.max(Math.min(p[b], q[b]), Math.min(r[b], s[b]));
        if (overlap > 0) cost += (20 + overlap * 2) * overlapWeight;
      } else {
        const [hp, hq, vp, vq] = h ? [p, q, r, s] : [r, s, p, q];
        if (vp[0] > Math.min(hp[0], hq[0]) + 0.5 && vp[0] < Math.max(hp[0], hq[0]) - 0.5 && hp[1] > Math.min(vp[1], vq[1]) + 0.5 && hp[1] < Math.max(vp[1], vq[1]) - 0.5) cost += 12;
      }
    }
  }
  return cost;
}

interface Grid {
  boxes: Map<Id, Box>;
  /** x of every column gap (margins included), y of every row gap. */
  xs: number[];
  ys: number[];
  layout?: FlowLayout;
}



/**
 * Every route worth trying from port `p0` (leaving by `out`) to port `q0`
 * (entering by `into`): straight, one bend, or along the gaps between rows
 * and columns, which no card ever occupies.
 */
function candidates(p0: Point, out: Side, q0: Point, into: Side, a: FlowNode, b: FlowNode, grid: Grid, lanes: readonly number[]): Point[][] {
  const { layout } = grid;
  const withLanes = (vs: number[]) => vs.flatMap((v) => lanes.map((l) => v + l));
  // Gap lines between the two ends, and the first one past them on each side: going further is never shorter.
  const near = (vs: number[], u: number, v: number) => {
    const lo = Math.min(u, v);
    const hi = Math.max(u, v);
    let i = 0;
    while (i < vs.length - 1 && vs[i + 1] < lo) i++;
    let j = vs.length - 1;
    while (j > 0 && vs[j - 1] > hi) j--;
    return vs.slice(i, j + 1);
  };
  const xsL = withLanes(near(grid.xs, p0[0], q0[0]));
  const ysL = withLanes(near(grid.ys, p0[1], q0[1]));
  const nearA = withLanes([gapBeside(a, out, layout)]);
  const nearB = withLanes([gapBeside(b, into, layout)]);
  const list: Point[][] = [[p0, q0], [p0, [q0[0], p0[1]], q0], [p0, [p0[0], q0[1]], q0]];
  for (const m of xsL) list.push([p0, [m, p0[1]], [m, q0[1]], q0]);
  for (const k of ysL) list.push([p0, [p0[0], k], [q0[0], k], q0]);
  // Three bends: one end through the gap beside its card, the other free.
  if (horizontal(out) && !horizontal(into)) {
    for (const m of xsL) for (const k of nearB) list.push([p0, [m, p0[1]], [m, k], [q0[0], k], q0]);
    for (const m of nearA) for (const k of ysL) list.push([p0, [m, p0[1]], [m, k], [q0[0], k], q0]);
  }
  if (!horizontal(out) && horizontal(into)) {
    for (const k of ysL) for (const m of nearB) list.push([p0, [p0[0], k], [m, k], [m, q0[1]], q0]);
    for (const k of nearA) for (const m of xsL) list.push([p0, [p0[0], k], [m, k], [m, q0[1]], q0]);
  }
  // Four bends: out into the gap beside `a`, along a free gap, into the gap beside `b`.
  if (horizontal(out) && horizontal(into)) {
    for (const m1 of nearA) for (const m2 of nearB) for (const k of ysL) list.push([p0, [m1, p0[1]], [m1, k], [m2, k], [m2, q0[1]], q0]);
  }
  if (!horizontal(out) && !horizontal(into)) {
    for (const k1 of nearA) for (const k2 of nearB) for (const m of xsL) list.push([p0, [p0[0], k1], [m, k1], [m, k2], [q0[0], k2], q0]);
  }
  return list;
}

/** A route leaves its card straight out, enters the other straight in, and keeps clear of every card. */
function valid(points: Point[], out: Side, into: Side, a: Id, b: Id, boxes: Map<Id, Box>): boolean {
  const n = points.length;
  if (n < 2) return false;
  const d0 = direction(points[0], points[1]);
  const dn = direction(points[n - 2], points[n - 1]);
  if (d0[0] !== NORMAL[out][0] || d0[1] !== NORMAL[out][1]) return false;
  if (dn[0] !== -NORMAL[into][0] || dn[1] !== -NORMAL[into][1]) return false;
  if (n > 2 && (segLen(points[0], points[1]) < MIN_OUT || segLen(points[n - 2], points[n - 1]) < MIN_IN)) return false;
  for (let i = 1; i < n; i++) {
    for (const [id, box] of boxes) {
      // The run out of `a` and into `b` only has to stay off their inside.
      const own = (id === a && i === 1) || (id === b && i === n - 1);
      if (hits(points[i - 1], points[i], box, own ? -0.5 : CLEAR)) return false;
    }
  }
  return true;
}

/** Leaving forward to the right and entering from the left reads most naturally. */
const sideCost = (out: Side, into: Side) => (out === 'right' ? 0 : 8) + (into === 'left' ? 0 : 8);

interface Choice {
  points: Point[];
  out: Side;
  into: Side;
  cost: number;
}

/** The cheapest valid route among every port and side tried. */
function best(a: FlowNode, b: FlowNode, options: { out: Side; into: Side; p0: Point[]; q0: Point[] }[], grid: Grid, placed: [Point, Point][], overlapWeight: number, lanes: readonly number[]): Choice | null {
  const all: { points: Point[]; out: Side; into: Side; base: number }[] = [];
  for (const { out, into, p0, q0 } of options)
    for (const p of p0)
      for (const q of q0)
        for (const c of candidates(p, out, q, into, a, b, grid, lanes)) {
          const points = simplify(c);
          all.push({ points, out, into, base: baseCost(points) + sideCost(out, into) });
        }
  all.sort((x, y) => x.base - y.base);
  let found: Choice | null = null;
  for (const c of all) {
    if (found && c.base >= found.cost) break;
    if (!valid(c.points, c.out, c.into, a.id, b.id, grid.boxes)) continue;
    const cost = c.base + clutter(c.points, placed, overlapWeight);
    if (!found || cost < found.cost) found = { points: c.points, out: c.out, into: c.into, cost };
  }
  return found;
}

const segments = (points: Point[]): [Point, Point][] => points.slice(1).map((p, i) => [points[i], p]);

/**
 * Routes every arrow of a flow by the most direct way that crosses no card:
 * each side of both cards is tried (or the ones the arrow asks for), and the
 * route kept is the shortest, with the fewest bends and the least overlap
 * with the arrows already drawn. Arrows sharing a side of a card then get
 * ports of their own, in the order of where they go, so they don't cross.
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
  const valid_ = flow.links.filter((l) => byId.has(l.from) && byId.has(l.to) && l.from !== l.to);
  if (!valid_.length) return new Map();
  const boxes = new Map<Id, Box>(flow.nodes.map((n) => [n.id, nodeBox(n, layout)]));
  const cols = Math.max(...flow.nodes.map((n) => n.col)) + 1;
  const rows = Math.max(...flow.nodes.map((n) => n.row)) + 1;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let c = 0; c <= cols; c++) xs.push(cellBox(c, 0, layout).x - FLOW.gapX / 2);
  for (let r = 0; r < rows; r++) ys.push(cellBox(0, r, layout).y - FLOW.gapY / 2);
  const last = cellBox(0, rows - 1, layout);
  ys.push(last.y + last.h + FLOW.gapY / 2);
  const grid: Grid = { boxes, xs, ys, layout };
  const centre = (id: Id, side: Side) => {
    const box = boxes.get(id)!;
    return portAt(box, side, span(box, side).mid);
  };
  const sidesOf = (want: Side | undefined) => (want ? [want] : SIDES);

  // First the sides: each arrow from the middle of a side to the middle of another.
  const placed: [Point, Point][] = [];
  const first = new Map<Id, Choice>();
  // Short arrows first: they get the straight runs.
  const order = [...valid_].sort((l, m) => {
    const d = (x: FlowLink) => Math.abs(byId.get(x.from)!.col - byId.get(x.to)!.col) + Math.abs(byId.get(x.from)!.row - byId.get(x.to)!.row);
    return d(l) - d(m);
  });
  for (const l of order) {
    const a = byId.get(l.from)!;
    const b = byId.get(l.to)!;
    const options = (outs: Side[], intos: Side[]) => outs.flatMap((out) => intos.map((into) => ({ out, into, p0: [centre(a.id, out)], q0: [centre(b.id, into)] })));
    // Arrows meeting at the middle of a side get ports of their own next: their overlap there counts little.
    const c = best(a, b, options(sidesOf(l.fromSide), sidesOf(l.toSide)), grid, placed, 0.3, [0]) ?? (l.fromSide || l.toSide ? best(a, b, options(SIDES, SIDES), grid, placed, 0.3, [0]) : null);
    if (!c) continue;
    first.set(l.id, c);
    placed.push(...segments(c.points));
  }

  // Then the ports: arrows sharing a side, spread in the order of where they head.
  const ends = new Map<string, { link: FlowLink; toward: number }[]>();
  const note = (node: Id, side: Side, link: FlowLink, other: Point) => {
    const key = `${node}:${side}`;
    ends.set(key, (ends.get(key) ?? []).concat([{ link, toward: horizontal(side) ? other[1] : other[0] }]));
  };
  for (const l of valid_) {
    const c = first.get(l.id);
    if (!c) continue;
    // Where the arrow goes once out of the card: its next bend, or its far end.
    note(l.from, c.out, l, c.points[Math.min(2, c.points.length - 1)]);
    note(l.to, c.into, l, c.points[Math.max(0, c.points.length - 3)]);
  }
  for (const list of ends.values()) list.sort((x, y) => x.toward - y.toward || (x.link.id < y.link.id ? -1 : x.link.id > y.link.id ? 1 : 0));
  /** A port of its own on a shared side; null when the arrow is alone there. */
  const fixed = (node: Id, side: Side, link: FlowLink): number | null => {
    const list = ends.get(`${node}:${side}`) ?? [];
    if (list.length < 2) return null;
    const i = list.findIndex((e) => e.link.id === link.id);
    const s = span(boxes.get(node)!, side);
    return clamp(s.mid + (i - (list.length - 1) / 2) * PORT_GAP, s.lo, s.hi);
  };

  const final: [Point, Point][] = [];
  const routes = new Map<Id, Point[]>();
  for (const l of order) {
    const a = byId.get(l.from)!;
    const b = byId.get(l.to)!;
    const c = first.get(l.id);
    if (!c) {
      routes.set(l.id, fallbackRoute(a, b, (col, row) => flow.nodes.some((n) => n.col === col && n.row === row), { layout }));
      continue;
    }
    const boxA = boxes.get(a.id)!;
    const boxB = boxes.get(b.id)!;
    const sa = span(boxA, c.out);
    const sb = span(boxB, c.into);
    const fa = fixed(a.id, c.out, l);
    const fb = fixed(b.id, c.into, l);
    // An arrow alone on its side slides to line up with the other end, to run straight.
    const along = (f: number | null, s: { lo: number; hi: number; mid: number }, other: (number | null)[], otherSpan: { lo: number; hi: number }) => {
      if (f !== null) return [f];
      const vs = [s.mid];
      // Only sides facing the same way can line up.
      if (horizontal(c.out) !== horizontal(c.into)) return vs;
      for (const o of other) if (o !== null && o >= s.lo && o <= s.hi) vs.push(o);
      const lo = Math.max(s.lo, otherSpan.lo);
      const hi = Math.min(s.hi, otherSpan.hi);
      if (lo <= hi) vs.push((lo + hi) / 2);
      return vs;
    };
    const ua = along(fa, sa, [fb, sb.mid], sb);
    const ub = along(fb, sb, [fa, sa.mid], sa);
    const pick = best(a, b, [{ out: c.out, into: c.into, p0: ua.map((u) => portAt(boxA, c.out, u)), q0: ub.map((u) => portAt(boxB, c.into, u)) }], grid, final, 1, GAP_LANES);
    const points = pick?.points ?? c.points;
    routes.set(l.id, points);
    final.push(...segments(points));
  }
  return routes;
}
