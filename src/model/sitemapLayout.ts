// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

// Where the cards of a sitemap's tree go: each level is a row, as tall as
// its tallest card, and each screen sits centred over the screens under it.

import type { Id, Screen } from './types';

export const CARD_W = 176;
/** Room between two cards side by side. */
export const GAP_X = 16;
/** Room between two levels, where the connectors run. */
export const LEVEL_GAP = 52;
/** Height of a card with a one-line name. */
export const MIN_CARD_H = 76;
/** Room kept above a branch's top card on its PDF page, short of the connector over it. */
const BRANCH_PAD = 6;
/** Room kept under a branch's lowest card, for the badges of modals and messages. */
const BRANCH_PAD_BOTTOM = 14;

export interface CardBox {
  id: Id;
  depth: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A straight piece of connector: vertical when `w` is 0, horizontal when `h` is 0. */
export interface Segment {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A screen and the room its branch takes: what a PDF page shows. A branch too
 * wide for a page is shown by its sub-branches, so each one carries its own.
 */
export interface Branch {
  id: Id;
  x0: number;
  x1: number;
  /** Just above its card: the screens above it are left out of its page. */
  top: number;
  /** Under its lowest card, with the badges hanging from it. */
  bottom: number;
  children: Branch[];
}

export interface TreeLayout {
  cards: CardBox[];
  segments: Segment[];
  /** Top and height of each level's row. */
  levels: { top: number; height: number }[];
  branches: Branch[];
  width: number;
  height: number;
}

/**
 * Lays the tree out from (0, 0). Screens under a folded one are left out;
 * `heights` gives the height each card's content needs, once measured.
 */
export function layoutTree(roots: Screen[], folded: (id: Id) => boolean, heights: Record<Id, number>): TreeLayout {
  const kids = (s: Screen) => (folded(s.id) ? [] : s.children);
  const widths = new Map<Id, number>();
  const widthOf = (s: Screen): number => {
    const k = kids(s);
    const w = k.length === 0 ? CARD_W : Math.max(CARD_W, k.reduce((sum, c) => sum + widthOf(c), 0) + GAP_X * (k.length - 1));
    widths.set(s.id, w);
    return w;
  };
  roots.forEach(widthOf);

  // Each level as tall as its tallest card.
  const rowHeights: number[] = [];
  const measure = (s: Screen, depth: number) => {
    rowHeights[depth] = Math.max(rowHeights[depth] ?? MIN_CARD_H, Math.ceil(heights[s.id] ?? MIN_CARD_H));
    kids(s).forEach((c) => measure(c, depth + 1));
  };
  roots.forEach((r) => measure(r, 0));
  const levels: { top: number; height: number }[] = [];
  let top = 0;
  for (const h of rowHeights) {
    levels.push({ top, height: h });
    top += h + LEVEL_GAP;
  }

  const cards: CardBox[] = [];
  const segments: Segment[] = [];
  const branches: Branch[] = [];
  /** Places `s` and its subtree from `x0`; returns the centre of its card. */
  const place = (s: Screen, x0: number, depth: number): number => {
    const w = widths.get(s.id)!;
    const k = kids(s);
    let centre = x0 + w / 2;
    if (k.length) {
      const span = k.reduce((sum, c) => sum + widths.get(c.id)!, 0) + GAP_X * (k.length - 1);
      let x = x0 + (w - span) / 2;
      const centres = k.map((c) => {
        const at = place(c, x, depth + 1);
        x += widths.get(c.id)! + GAP_X;
        return at;
      });
      centre = (centres[0] + centres[centres.length - 1]) / 2;
      const bottom = levels[depth].top + levels[depth].height;
      const childTop = levels[depth + 1].top;
      const mid = bottom + LEVEL_GAP / 2;
      segments.push({ x: centre, y: bottom, w: 0, h: mid - bottom });
      const left = Math.min(centre, centres[0]);
      const right = Math.max(centre, centres[centres.length - 1]);
      if (right - left > 0.5) segments.push({ x: left, y: mid, w: right - left, h: 0 });
      for (const c of centres) segments.push({ x: c, y: mid, w: 0, h: childTop - mid });
    }
    cards.push({ id: s.id, depth, x: centre - CARD_W / 2, y: levels[depth].top, w: CARD_W, h: levels[depth].height });
    return centre;
  };
  let x = 0;
  for (const r of roots) {
    place(r, x, 0);
    x += widths.get(r.id)! + 2 * GAP_X;
  }
  const width = roots.length ? x - 2 * GAP_X : 0;

  // A PDF page per branch: the second level under a single top screen, else each top screen.
  const byId = new Map(cards.map((c) => [c.id, c]));
  const branch = (s: Screen): Branch => {
    const own = byId.get(s.id)!;
    const children = kids(s).map(branch);
    return {
      id: s.id,
      x0: Math.min(own.x, ...children.map((c) => c.x0)),
      x1: Math.max(own.x + own.w, ...children.map((c) => c.x1)),
      top: Math.max(0, own.y - BRANCH_PAD),
      bottom: Math.max(own.y + own.h + BRANCH_PAD_BOTTOM, ...children.map((c) => c.bottom)),
      children,
    };
  };
  const tops = roots.length === 1 ? kids(roots[0]) : roots;
  branches.push(...tops.map(branch));
  const height = levels.length ? levels[levels.length - 1].top + levels[levels.length - 1].height : 0;
  return { cards, segments, levels, branches, width, height };
}
