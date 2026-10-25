// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Flow, FlowNode, Id } from './types';

/** Grid of a flow, in layout pixels: cells, gaps between them, margin. */
export const FLOW = {
  cellW: 180,
  /** The smallest card; a row grows to fit its tallest card. */
  cellH: 96,
  gapX: 64,
  gapY: 56,
  pad: 48,
  /** Start and end cards are pills, smaller than their cell. */
  pillW: 96,
  pillH: 44,
} as const;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Card heights the text needs, as measured on screen, and the row heights
 * that follow. Without one, every row and card has the smallest height.
 */
export interface FlowLayout {
  rows: number[];
  nodes: Record<Id, number>;
}

const rowHeight = (row: number, layout?: FlowLayout) => layout?.rows[row] ?? FLOW.cellH;

/** Each row as tall as its tallest card. */
export function flowLayout(flow: Flow, measured: Record<Id, number>): FlowLayout {
  const rows: number[] = [];
  const nodes: Record<Id, number> = {};
  for (const n of flow.nodes) {
    if (n.kind === 'start' || n.kind === 'end') continue;
    const h = Math.max(FLOW.cellH, Math.ceil(measured[n.id] ?? 0));
    nodes[n.id] = h;
    rows[n.row] = Math.max(rows[n.row] ?? FLOW.cellH, h);
  }
  return { rows: Array.from(rows, (h) => h ?? FLOW.cellH), nodes };
}

/** The cell at (col, row). */
export function cellBox(col: number, row: number, layout?: FlowLayout): Box {
  let y = FLOW.pad;
  for (let r = 0; r < row; r++) y += rowHeight(r, layout) + FLOW.gapY;
  return { x: FLOW.pad + col * (FLOW.cellW + FLOW.gapX), y, w: FLOW.cellW, h: rowHeight(row, layout) };
}

/** Where a card is drawn: centred in its cell, as tall as its text needs; start and end are pills. */
export function nodeBox(node: Pick<FlowNode, 'id' | 'col' | 'row' | 'kind'>, layout?: FlowLayout): Box {
  const cell = cellBox(node.col, node.row, layout);
  const pill = node.kind === 'start' || node.kind === 'end';
  const w = pill ? FLOW.pillW : cell.w;
  const h = pill ? FLOW.pillH : Math.min(cell.h, layout?.nodes[node.id] ?? FLOW.cellH);
  return { x: cell.x + (cell.w - w) / 2, y: cell.y + (cell.h - h) / 2, w, h };
}

/** Size of the drawing for a flow spanning `cols` × `rows` cells. */
export function flowSize(cols: number, rows: number, layout?: FlowLayout): { w: number; h: number } {
  const last = cellBox(0, Math.max(0, rows - 1), layout);
  return {
    w: FLOW.pad * 2 + cols * FLOW.cellW + Math.max(0, cols - 1) * FLOW.gapX,
    h: rows > 0 ? last.y + last.h + FLOW.pad : FLOW.pad * 2,
  };
}
