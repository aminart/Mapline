// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import type { FlowNode } from './types';

/** Grid of a flow, in layout pixels: cells, gaps between them, margin. */
export const FLOW = {
  cellW: 180,
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

/** The cell at (col, row). */
export function cellBox(col: number, row: number): Box {
  return {
    x: FLOW.pad + col * (FLOW.cellW + FLOW.gapX),
    y: FLOW.pad + row * (FLOW.cellH + FLOW.gapY),
    w: FLOW.cellW,
    h: FLOW.cellH,
  };
}

/** Where a card is drawn: its whole cell, or a centred pill for start and end. */
export function nodeBox(node: Pick<FlowNode, 'col' | 'row' | 'kind'>): Box {
  const cell = cellBox(node.col, node.row);
  if (node.kind !== 'start' && node.kind !== 'end') return cell;
  return { x: cell.x + (cell.w - FLOW.pillW) / 2, y: cell.y + (cell.h - FLOW.pillH) / 2, w: FLOW.pillW, h: FLOW.pillH };
}

/** Size of the drawing for a flow spanning `cols` × `rows` cells. */
export function flowSize(cols: number, rows: number): { w: number; h: number } {
  return {
    w: FLOW.pad * 2 + cols * FLOW.cellW + Math.max(0, cols - 1) * FLOW.gapX,
    h: FLOW.pad * 2 + rows * FLOW.cellH + Math.max(0, rows - 1) * FLOW.gapY,
  };
}
