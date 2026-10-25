// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Gaps {
  /** Horizontal space between activity columns. */
  col: number;
  /** Vertical space between persona rows. */
  row: number;
}

type Point = [number, number];

const CORNER = 8;
/** Offsets that keep arrows sharing a gap on distinct lanes. */
const ROW_LANES = [0, -5, 5, -10, 10];
const COL_LANES = [0, -3, 3];
/** Arrows leave right of centre and arrive left of it, so they never meet head-on. */
const PORT = 10;

/**
 * Orthogonal route for an arrow from box `a` to box `b`, going through the
 * gaps between rows and columns so it never crosses another box.
 *
 * `cellA` and `cellB` are the grid cells holding the boxes. A box can fill
 * only part of its cell (two alternative cards share one): the route is
 * planned on the cells, and a box that doesn't touch the cell edge the route
 * needs leaves through the column gap beside it instead.
 */
export function routeArrow(a: Rect, b: Rect, gaps: Gaps, lane = 0, cellA: Rect = a, cellB: Rect = b): Point[] {
  const acy = cellA.y + cellA.h / 2;
  const bcy = cellB.y + cellB.h / 2;
  const sx = a.x + a.w / 2 + PORT;
  const ex = b.x + b.w / 2 - PORT;
  const rowLane = ROW_LANES[lane % ROW_LANES.length];
  const colLane = COL_LANES[lane % COL_LANES.length];

  // From box `box` to the row gap at `gapY`, leaving the cell by `edge`.
  const reach = (box: Rect, cell: Rect, edge: 'top' | 'bottom', x: number, gapY: number, towardX: number, offset: number): Point[] => {
    const edgeY = edge === 'top' ? cell.y : cell.y + cell.h;
    const boxEdgeY = edge === 'top' ? box.y : box.y + box.h;
    // A few pixels of slack for rounding in the measured layout.
    if (Math.abs(edgeY - boxEdgeY) < 3) return [[x, boxEdgeY], [x, gapY]];
    // The other card of the cell is in the way: out by the side, down the column gap.
    const right = towardX >= box.x + box.w / 2;
    const sideX = right ? cell.x + cell.w : cell.x;
    const gapX = sideX + (right ? 1 : -1) * (gaps.col / 2) + colLane;
    const y = box.y + box.h / 2 + offset;
    return [[sideX, y], [gapX, y], [gapX, gapY]];
  };
  const leaveFrom = (edge: 'top' | 'bottom', gapY: number, towardX: number) => reach(a, cellA, edge, sx, gapY, towardX, -PORT / 2);
  const arriveAt = (edge: 'top' | 'bottom', gapY: number, fromX: number) => reach(b, cellB, edge, ex, gapY, fromX, PORT / 2).reverse();

  if (Math.abs(cellA.x - cellB.x) < 1 && Math.abs(acy - bcy) < 1) {
    // Two cards of the same cell: round the right side, in the column gap.
    const gapX = cellA.x + cellA.w + gaps.col / 2 + colLane;
    const ay = a.y + a.h / 2;
    const by = b.y + b.h / 2;
    return [[a.x + a.w, ay], [gapX, ay], [gapX, by], [b.x + b.w, by]];
  }

  if (Math.abs(acy - bcy) < cellA.h / 2) {
    const right = cellB.x > cellA.x;
    const between = right ? cellB.x - (cellA.x + cellA.w) : cellA.x - (cellB.x + cellB.w);
    if (between <= gaps.col + 1) {
      // Neighbours: across the column gap, with a step in it if the boxes are at different heights.
      const ay = a.y + a.h / 2;
      const by = b.y + b.h / 2;
      const [ax, bx] = right ? [a.x + a.w, b.x] : [a.x, b.x + b.w];
      if (Math.abs(ay - by) < 1) return [[ax, ay], [bx, by]];
      const midX = (ax + bx) / 2;
      return [[ax, ay], [midX, ay], [midX, by], [bx, by]];
    }
    // Boxes in between: go round underneath, through the row gap.
    const laneY = Math.max(cellA.y + cellA.h, cellB.y + cellB.h) + gaps.row / 2 + rowLane;
    return simplify([...leaveFrom('bottom', laneY, ex), ...arriveAt('bottom', laneY, sx)]);
  }

  const down = bcy > acy;
  const sy = down ? cellA.y + cellA.h : cellA.y;
  const ey = down ? cellB.y : cellB.y + cellB.h;
  const dir = down ? 1 : -1;
  const leave = sy + (dir * gaps.row) / 2 + rowLane;
  const enter = ey - (dir * gaps.row) / 2 + rowLane;
  const span = Math.abs(ey - sy);
  const startEdge = down ? 'bottom' : 'top';
  const endEdge = down ? 'top' : 'bottom';

  if (span <= gaps.row + 1) {
    // Adjacent rows: one horizontal hop in the gap between them.
    return simplify([...leaveFrom(startEdge, leave, ex), ...arriveAt(endEdge, leave, sx)]);
  }
  // Rows in between: drop down the column gap beside the target.
  const laneX = (ex >= sx ? cellB.x - gaps.col / 2 : cellB.x + cellB.w + gaps.col / 2) + colLane;
  return simplify([...leaveFrom(startEdge, leave, laneX), [laneX, leave], [laneX, enter], ...arriveAt(endEdge, enter, laneX)]);
}

function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - p[0]) < 0.5 && Math.abs(last[1] - p[1]) < 0.5) continue;
    const prev = out[out.length - 2];
    // Drop the middle point of three aligned ones.
    if (prev && last && ((prev[0] === last[0] && last[0] === p[0]) || (prev[1] === last[1] && last[1] === p[1]))) {
      out[out.length - 1] = p;
      continue;
    }
    out.push(p);
  }
  return out;
}

/** SVG path through the points, with rounded corners. */
export function roundedPath(points: Point[], radius = CORNER): string {
  const pts = simplify(points);
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const inLen = Math.hypot(cx - px, cy - py);
    const outLen = Math.hypot(nx - cx, ny - cy);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const bx = cx - ((cx - px) / inLen) * r;
    const by = cy - ((cy - py) / inLen) * r;
    const ax = cx + ((nx - cx) / outLen) * r;
    const ay = cy + ((ny - cy) / outLen) * r;
    d += ` L${bx} ${by} Q${cx} ${cy} ${ax} ${ay}`;
  }
  const [lx, ly] = pts[pts.length - 1];
  return `${d} L${lx} ${ly}`;
}

export function arrowPath(a: Rect, b: Rect, gaps: Gaps, lane = 0): string {
  return roundedPath(routeArrow(a, b, gaps, lane));
}

/** The point halfway along a polyline, where an arrow's label goes. */
export function midpoint(points: Point[]): { x: number; y: number } {
  return pointAlong(points, 0.5);
}

/** The point at `fraction` (0 to 1) of a polyline's length. */
export function pointAlong(points: Point[], fraction: number): { x: number; y: number } {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  let half = lengths.reduce((a, b) => a + b, 0) * fraction;
  for (let i = 0; i < lengths.length; i++) {
    if (half <= lengths[i] && lengths[i] > 0) {
      const f = half / lengths[i];
      const [x1, y1] = points[i];
      const [x2, y2] = points[i + 1];
      return { x: x1 + (x2 - x1) * f, y: y1 + (y2 - y1) * f };
    }
    half -= lengths[i];
  }
  const [x, y] = points[points.length - 1];
  return { x, y };
}
