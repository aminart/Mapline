// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { planPages, planPhasePages } from './exportPdf';
import type { BoardLayout } from './exportImage';

/** A board with `n` steps of `cols` activity columns each, laid out like the app. */
function board(n: number, cols = 1): BoardLayout {
  const steps = Array.from({ length: n }, (_, i) => {
    const left = 260 + i * (cols * 196);
    return { left, right: left + cols * 196 - 12 };
  });
  return { width: steps[n - 1].right + 160, height: 900, stripRight: 254, steps, objectiveBottom: 100, objective: '', phases: [] };
}

const A4 = { w: 842, h: 595 };

describe('planPages', () => {
  it('packs whole steps per page, in order, covering every step once', () => {
    const plan = planPages(board(10), A4);
    expect(plan.pages.length).toBeGreaterThan(1);
    expect(plan.pages[0].firstStep).toBe(0);
    expect(plan.pages[plan.pages.length - 1].lastStep).toBe(9);
    for (let i = 1; i < plan.pages.length; i++) expect(plan.pages[i].firstStep).toBe(plan.pages[i - 1].lastStep + 1);
    // Each page fits next to the persona column.
    for (const p of plan.pages) expect((254 + p.x1 - p.x0) * plan.k).toBeLessThanOrEqual(842 - 56 + 0.01);
  });

  it('scales the board so its height fits the page', () => {
    const plan = planPages(board(3), A4);
    expect((900 - 100) * plan.k).toBeLessThanOrEqual(595 - 56 - 38 - 16 + 0.01);
  });

  it('slices a step that is wider than a page', () => {
    const plan = planPages(board(1, 12), A4);
    expect(plan.pages.length).toBeGreaterThan(1);
    expect(plan.pages.every((p) => p.firstStep === 0 && p.lastStep === 0)).toBe(true);
  });

  it('puts a small board on a single page, never enlarged', () => {
    const small = { width: 800, height: 400, stripRight: 254, steps: [{ left: 260, right: 444 }], objectiveBottom: 90, objective: '', phases: [] };
    const plan = planPages(small, { w: 1191, h: 842 });
    expect(plan.pages).toHaveLength(1);
    expect(plan.k).toBe(0.75);
  });
});

describe('planPhasePages', () => {
  it('gives each phase its own page, starting at the phase row', () => {
    const layout = board(5);
    layout.phases = [
      { left: layout.steps[0].left, right: layout.steps[1].right, top: 110, height: 36, title: 'Avant', color: '#000', size: 14 },
      { left: layout.steps[2].left, right: layout.steps[4].right, top: 110, height: 36, title: '', color: '#000', size: 14 },
    ];
    const pages = planPhasePages(layout);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({ x0: layout.steps[0].left - 6, x1: layout.steps[1].right + 6, top: 98, title: 'Avant', index: 0 });
    expect(pages[1]).toMatchObject({ x0: layout.steps[2].left - 6, x1: layout.steps[4].right + 6, index: 1 });
  });

  it('falls back to one page for all the steps when there are no phases', () => {
    const pages = planPhasePages(board(3));
    expect(pages).toHaveLength(1);
    expect(pages[0].top).toBe(100);
  });
});
