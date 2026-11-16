// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { pdfTextColor, planPages, planPhasePages, planPhasePdfPages } from './exportPdf';
import type { BoardLayout } from './exportImage';

/** A board with `n` steps of `cols` activity columns each, laid out like the app. */
function board(n: number, cols = 1): BoardLayout {
  const steps = Array.from({ length: n }, (_, i) => {
    const left = 260 + i * (cols * 196);
    return { left, right: left + cols * 196 - 12 };
  });
  return { width: steps[n - 1].right + 160, height: 900, stripRight: 254, steps, objectiveBottom: 100, contentBottom: 900, objective: '', phases: [] };
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

  it('puts a step wider than a page on a page of its own, scaled down so no card is cut', () => {
    const layout = board(3);
    layout.steps[1] = { left: layout.steps[1].left, right: layout.steps[1].left + 12 * 196 - 12 };
    layout.steps[2] = { left: layout.steps[1].right + 12, right: layout.steps[1].right + 12 + 184 };
    const plan = planPages(layout, A4);
    const wide = plan.pages.find((p) => p.firstStep === 1)!;
    expect(wide).toMatchObject({ lastStep: 1, x0: layout.steps[1].left - 6, x1: layout.steps[1].right + 6 });
    expect(wide.k).toBeLessThan(plan.k);
    expect((254 + wide.x1 - wide.x0) * wide.k).toBeCloseTo(842 - 56);
    // The other pages keep the common scale.
    expect(plan.pages.filter((p) => p !== wide).every((p) => p.k === plan.k)).toBe(true);
  });

  it('puts a small board on a single page, never enlarged', () => {
    const small = { width: 800, height: 400, stripRight: 254, steps: [{ left: 260, right: 444 }], objectiveBottom: 90, contentBottom: 400, objective: '', phases: [] };
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

describe('planPhasePdfPages', () => {
  const withPhases = (n: number, spans: number[]) => {
    const layout = board(n);
    let at = 0;
    layout.phases = spans.map((span, i) => {
      const ph = { left: layout.steps[at].left, right: layout.steps[at + span - 1].right, top: 110, height: 36, title: i === 0 ? 'Avant' : '', color: '#000', size: 14 };
      at += span;
      return ph;
    });
    return layout;
  };

  it('starts a new A4 page for each phase, with only its steps, all at one scale', () => {
    const layout = withPhases(5, [2, 3]);
    const pages = planPhasePdfPages(layout, A4);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({ phase: 0, title: 'Avant', firstStep: 0, lastStep: 1, part: 1, parts: 1, x0: layout.steps[0].left - 6, x1: layout.steps[1].right + 6 });
    expect(pages[1]).toMatchObject({ phase: 1, title: '', firstStep: 2, lastStep: 4, part: 1, parts: 1 });
    expect(pages[0].k).toBe(pages[1].k);
    expect(pages[0].k).toBe(planPages(layout, A4).k);
  });

  it('goes on over several pages for a phase too wide for one, cut between steps', () => {
    const layout = withPhases(12, [1, 11]);
    const pages = planPhasePdfPages(layout, A4);
    const second = pages.filter((p) => p.phase === 1);
    expect(second.length).toBeGreaterThan(1);
    expect(second.map((p) => p.part)).toEqual(second.map((_, i) => i + 1));
    expect(second.every((p) => p.parts === second.length)).toBe(true);
    expect(second[0].firstStep).toBe(1);
    expect(second[second.length - 1].lastStep).toBe(11);
    for (let i = 1; i < second.length; i++) expect(second[i].firstStep).toBe(second[i - 1].lastStep + 1);
    for (const p of pages) expect((254 + p.x1 - p.x0) * p.k).toBeLessThanOrEqual(842 - 56 + 0.01);
  });

  it('zooms a phase in as far as its page allows, the same on each of its pages', () => {
    const layout = withPhases(15, [1, 3, 11]);
    layout.contentBottom = 400;
    const pages = planPhasePdfPages(layout, A4);
    const usable = { w: 842 - 56, h: 595 - 56 - 38 - 16 };
    for (const p of pages) {
      expect((254 + p.x1 - p.x0) * p.k).toBeLessThanOrEqual(usable.w + 0.01);
      expect((400 - 100) * p.k).toBeLessThanOrEqual(usable.h + 0.01);
    }
    // One step, then three: bigger than 100 % (0.75 pt per px), up to 133 %.
    expect(pages[0].k).toBeGreaterThan(0.75);
    expect(pages[0].k).toBeLessThanOrEqual(1);
    expect(pages[1].k).toBeGreaterThan(0.75);
    expect(pages[1].k).toBeLessThan(pages[0].k);
    // Several pages: one scale for the whole phase.
    const third = pages.filter((p) => p.phase === 2);
    expect(third.length).toBeGreaterThan(1);
    expect(new Set(third.map((p) => p.k)).size).toBe(1);
  });

  it('leaves out the blank band under the last row when fitting the height', () => {
    const layout = withPhases(2, [2]);
    const full = planPhasePdfPages(layout, A4)[0].k;
    layout.contentBottom = 780;
    expect(planPhasePdfPages(layout, A4)[0].k).toBeGreaterThan(full);
  });

  it('puts all the steps on pages of their own when the map has no phases', () => {
    const pages = planPhasePdfPages(board(3), A4);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ phase: -1, firstStep: 0, lastStep: 2 });
  });
});

describe('pdfTextColor', () => {
  it('reads the colours the browser gives', () => {
    expect(pdfTextColor('rgb(30, 58, 158)')).toEqual([30, 58, 158]);
    expect(pdfTextColor('rgba(200, 10, 0, 0.5)')).toEqual([200, 10, 0]);
    expect(pdfTextColor('#FF8800')).toEqual([255, 136, 0]);
  });

  it('never hands jsPDF a see-through or unreadable colour', () => {
    // A frozen field is see-through: jsPDF threw "invalid color" on it.
    expect(pdfTextColor('rgba(0, 0, 0, 0)')).toEqual([30, 58, 158]);
    expect(pdfTextColor('rgba(0,0,0,0)')).toEqual([30, 58, 158]);
    expect(pdfTextColor('transparent')).toEqual([30, 58, 158]);
    expect(pdfTextColor('')).toEqual([30, 58, 158]);
  });
});
