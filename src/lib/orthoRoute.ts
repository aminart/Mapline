// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Orthogonal arrows between boxes, by the most direct way that crosses no
 * box: shared by the flows and the maps, each giving its boxes and the gaps
 * between its rows and columns.
 */

import type { Id, LinkSide } from '../model/types';

export type Point = [number, number];
export type Side = LinkSide;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];
export const horizontal = (s: Side) => s === 'left' || s === 'right';

/** An arrow to route: its two boxes, and the sides it asks to leave and enter by. */
export interface RouteRequest {
  id: Id;
  from: Id;
  to: Id;
  fromSide?: Side;
  toSide?: Side;
}

/** Where the arrows can go. */
export interface RouteSpace {
  /** Every box an arrow must not cross, the ends of the arrows included. */
  boxes: Map<Id, Box>;
  /** x of the column gaps, and y of the row gaps, in order: free of boxes from end to end. */
  xs: number[];
  ys: number[];
  /** The gap just outside a box's side: x of a column gap, or y of a row gap. */
  beside(id: Id, side: Side): number;
  /** Where the arrows must stay: the whole drawing when unset. */
  bounds?: Box;
  /** How far apart two boxes are: the nearest are routed first and get the straight runs. */
  distance?(from: Id, to: Id): number;
}

/** Sizes that fit the drawing: how wide its gaps are, how big its arrowheads. */
export interface RouteStyle {
  /** Space kept between an arrow and a box it passes. */
  clear: number;
  /** Offsets tried around a column gap's middle, and a row gap's, so arrows can run side by side. */
  xLanes: readonly number[];
  yLanes: readonly number[];
  /** Shortest run out of a box, and into one (room for the arrowhead). */
  minOut: number;
  minIn: number;
  /** Space between arrows leaving or entering the same side of a box. */
  portGap: number;
  /** A run out of a box or into one shorter than `below` reads as a stub: it costs `cost` more. */
  stub?: { below: number; cost: number };
}

const NORMAL: Record<Side, Point> = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
/** Cost of a bend, in pixels of length: a longer route with fewer bends reads better. */
const BEND = 40;

export function simplify(points: Point[]): Point[] {
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

interface Lanes {
  x: readonly number[];
  y: readonly number[];
}

/**
 * Every route worth trying from port `p0` (leaving by `out`) to port `q0`
 * (entering by `into`): straight, one bend, or along the gaps between rows
 * and columns, which no box ever occupies.
 */
function candidates(p0: Point, out: Side, q0: Point, into: Side, a: Id, b: Id, space: RouteSpace, lanes: Lanes): Point[][] {
  const withLanes = (vs: number[], ls: readonly number[]) => vs.flatMap((v) => ls.map((l) => v + l));
  // Gap lines between the two ends, and the first one past them on each side: going further is never shorter.
  const near = (vs: number[], u: number, v: number) => {
    if (!vs.length) return [];
    const lo = Math.min(u, v);
    const hi = Math.max(u, v);
    let i = 0;
    while (i < vs.length - 1 && vs[i + 1] < lo) i++;
    let j = vs.length - 1;
    while (j > 0 && vs[j - 1] > hi) j--;
    return vs.slice(i, j + 1);
  };
  const xsL = withLanes(near(space.xs, p0[0], q0[0]), lanes.x);
  const ysL = withLanes(near(space.ys, p0[1], q0[1]), lanes.y);
  const nearA = withLanes([space.beside(a, out)], horizontal(out) ? lanes.x : lanes.y);
  const nearB = withLanes([space.beside(b, into)], horizontal(into) ? lanes.x : lanes.y);
  const list: Point[][] = [[p0, q0], [p0, [q0[0], p0[1]], q0], [p0, [p0[0], q0[1]], q0]];
  for (const m of xsL) list.push([p0, [m, p0[1]], [m, q0[1]], q0]);
  for (const k of ysL) list.push([p0, [p0[0], k], [q0[0], k], q0]);
  // Three bends: one end through the gap beside its box, the other free.
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

/** A route leaves its box straight out, enters the other straight in, and keeps clear of every box. */
function valid(points: Point[], out: Side, into: Side, a: Id, b: Id, space: RouteSpace, style: RouteStyle): boolean {
  const { boxes, bounds } = space;
  const n = points.length;
  if (n < 2) return false;
  if (bounds && points.some(([x, y]) => x < bounds.x || x > bounds.x + bounds.w || y < bounds.y || y > bounds.y + bounds.h)) return false;
  const d0 = direction(points[0], points[1]);
  const dn = direction(points[n - 2], points[n - 1]);
  if (d0[0] !== NORMAL[out][0] || d0[1] !== NORMAL[out][1]) return false;
  if (dn[0] !== -NORMAL[into][0] || dn[1] !== -NORMAL[into][1]) return false;
  if (n > 2 && (segLen(points[0], points[1]) < style.minOut || segLen(points[n - 2], points[n - 1]) < style.minIn)) return false;
  for (let i = 1; i < n; i++) {
    for (const [id, box] of boxes) {
      // The run out of `a` and into `b` only has to stay off their inside.
      const own = (id === a && i === 1) || (id === b && i === n - 1);
      if (hits(points[i - 1], points[i], box, own ? -0.5 : style.clear)) return false;
    }
  }
  return true;
}

function stubCost(points: Point[], style: RouteStyle): number {
  const n = points.length;
  if (!style.stub || n < 3) return 0;
  const short = (p: Point, q: Point) => (segLen(p, q) < style.stub!.below ? style.stub!.cost : 0);
  return short(points[0], points[1]) + short(points[n - 2], points[n - 1]);
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
function best(a: Id, b: Id, options: { out: Side; into: Side; p0: Point[]; q0: Point[] }[], space: RouteSpace, style: RouteStyle, placed: [Point, Point][], overlapWeight: number, lanes: Lanes): Choice | null {
  const all: { points: Point[]; out: Side; into: Side; base: number }[] = [];
  for (const { out, into, p0, q0 } of options)
    for (const p of p0)
      for (const q of q0)
        for (const c of candidates(p, out, q, into, a, b, space, lanes)) {
          const points = simplify(c);
          all.push({ points, out, into, base: baseCost(points) + sideCost(out, into) + stubCost(points, style) });
        }
  all.sort((x, y) => x.base - y.base);
  let found: Choice | null = null;
  for (const c of all) {
    if (found && c.base >= found.cost) break;
    if (!valid(c.points, c.out, c.into, a, b, space, style)) continue;
    const cost = c.base + clutter(c.points, placed, overlapWeight);
    if (!found || cost < found.cost) found = { points: c.points, out: c.out, into: c.into, cost };
  }
  return found;
}

const segments = (points: Point[]): [Point, Point][] => points.slice(1).map((p, i) => [points[i], p]);

/**
 * Routes arrows by the most direct way that crosses no box: each side of
 * both boxes is tried (or the ones the arrow asks for), and the route kept
 * is the shortest, with the fewest bends and the least overlap with the
 * arrows already drawn. Arrows sharing a side of a box then get ports of
 * their own, in the order of where they go, so they don't cross.
 *
 * An arrow left out of the result found no way: the caller draws it its own way.
 */
export function routeOrthogonal(requests: RouteRequest[], space: RouteSpace, style: RouteStyle): Map<Id, Point[]> {
  const { boxes } = space;
  const links = requests.filter((l) => boxes.has(l.from) && boxes.has(l.to) && l.from !== l.to);
  const routes = new Map<Id, Point[]>();
  if (!links.length) return routes;
  const centre = (id: Id, side: Side) => {
    const box = boxes.get(id)!;
    return portAt(box, side, span(box, side).mid);
  };
  // A side unknown to this version (a newer file, say) counts as automatic.
  const sidesOf = (want: Side | undefined) => (want && SIDES.includes(want) ? [want] : SIDES);
  const middle = (id: Id): Point => {
    const b = boxes.get(id)!;
    return [b.x + b.w / 2, b.y + b.h / 2];
  };
  const distance = space.distance ?? ((from: Id, to: Id) => segLen(middle(from), middle(to)));
  const single: Lanes = { x: [0], y: [0] };

  // First the sides: each arrow from the middle of a side to the middle of another.
  const placed: [Point, Point][] = [];
  const first = new Map<Id, Choice>();
  // Short arrows first: they get the straight runs.
  const order = [...links].sort((l, m) => distance(l.from, l.to) - distance(m.from, m.to));
  for (const l of order) {
    const options = (outs: Side[], intos: Side[]) => outs.flatMap((out) => intos.map((into) => ({ out, into, p0: [centre(l.from, out)], q0: [centre(l.to, into)] })));
    // Arrows meeting at the middle of a side get ports of their own next: their overlap there counts little.
    const c =
      best(l.from, l.to, options(sidesOf(l.fromSide), sidesOf(l.toSide)), space, style, placed, 0.3, single) ??
      (sidesOf(l.fromSide).length === 1 || sidesOf(l.toSide).length === 1 ? best(l.from, l.to, options(SIDES, SIDES), space, style, placed, 0.3, single) : null);
    if (!c) continue;
    first.set(l.id, c);
    placed.push(...segments(c.points));
  }

  // Then the ports: arrows sharing a side, spread in the order of where they head.
  const ends = new Map<string, { link: RouteRequest; toward: number }[]>();
  const note = (box: Id, side: Side, link: RouteRequest, other: Point) => {
    const key = `${box}:${side}`;
    ends.set(key, (ends.get(key) ?? []).concat([{ link, toward: horizontal(side) ? other[1] : other[0] }]));
  };
  for (const l of links) {
    const c = first.get(l.id);
    if (!c) continue;
    // Where the arrow goes once out of the box: its next bend, or its far end.
    note(l.from, c.out, l, c.points[Math.min(2, c.points.length - 1)]);
    note(l.to, c.into, l, c.points[Math.max(0, c.points.length - 3)]);
  }
  for (const list of ends.values()) list.sort((x, y) => x.toward - y.toward || (x.link.id < y.link.id ? -1 : x.link.id > y.link.id ? 1 : 0));
  /** A port of its own on a shared side; null when the arrow is alone there. */
  const fixed = (box: Id, side: Side, link: RouteRequest): number | null => {
    const list = ends.get(`${box}:${side}`) ?? [];
    if (list.length < 2) return null;
    const i = list.findIndex((e) => e.link.id === link.id);
    const s = span(boxes.get(box)!, side);
    return clamp(s.mid + (i - (list.length - 1) / 2) * style.portGap, s.lo, s.hi);
  };

  const final: [Point, Point][] = [];
  const lanes: Lanes = { x: style.xLanes, y: style.yLanes };
  for (const l of order) {
    const c = first.get(l.id);
    if (!c) continue;
    const boxA = boxes.get(l.from)!;
    const boxB = boxes.get(l.to)!;
    const sa = span(boxA, c.out);
    const sb = span(boxB, c.into);
    const fa = fixed(l.from, c.out, l);
    const fb = fixed(l.to, c.into, l);
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
    const pick = best(l.from, l.to, [{ out: c.out, into: c.into, p0: ua.map((u) => portAt(boxA, c.out, u)), q0: ub.map((u) => portAt(boxB, c.into, u)) }], space, style, final, 1, lanes);
    const points = pick?.points ?? c.points;
    routes.set(l.id, points);
    final.push(...segments(points));
  }
  return routes;
}
