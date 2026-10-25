// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type Locator, type Page } from '@playwright/test';

/** Opens the app on a new project made from the first template (Map). */
export async function startProject(page: Page) {
  await page.goto('/');
  await page.locator('.start .tpl-card').first().click();
  await expect(page.locator('.board')).toBeVisible();
}

/** Opens the menu of open projects in the main bar; returns its entries. */
export async function openProjects(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Projets ouverts' }).click();
  return page.locator('.project-item');
}

/** The cell of persona row `row` (0-based) in activity column `col`. */
export function cell(page: Page, row: number, col: number): Locator {
  return page.locator('.persona-row').nth(row).locator('.cell').nth(col);
}

/** Creates an activity in an empty cell and types its text. */
export async function addActivity(page: Page, row: number, col: number, text: string) {
  await cell(page, row, col).getByRole('button', { name: 'Ajouter une activité ici' }).click();
  await page.keyboard.type(text);
}

/** Links two activities with the Connect tool, then goes back to selecting. */
export async function link(page: Page, from: Locator, to: Locator) {
  await page.getByRole('button', { name: 'Relier', exact: true }).click();
  await from.locator('.link-target').click();
  await to.locator('.link-target').click();
  await page.getByRole('button', { name: 'Sélection', exact: true }).click();
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Every arrow, sampled along its path, checked against every activity card:
 * returns the cards an arrow runs over (its own two ends included only if it
 * goes through them rather than stopping at their edge).
 */
export async function arrowsOverCards(page: Page, cardSelector = '.persona-grid [data-act]'): Promise<string[]> {
  return page.evaluate((cardSelector) => {
    const svg = document.querySelector<SVGSVGElement>('svg.links');
    if (!svg) return [];
    const origin = svg.getBoundingClientRect();
    const cards = Array.from(document.querySelectorAll<HTMLElement>(cardSelector)).map((el) => ({
      text: el.querySelector('textarea')?.value ?? el.querySelector('input')?.value ?? '',
      box: el.getBoundingClientRect(),
    }));
    const problems: string[] = [];
    svg.querySelectorAll<SVGPathElement>('.link-line').forEach((path, i) => {
      const length = path.getTotalLength();
      for (let d = 0; d <= length; d += 2) {
        const p = path.getPointAtLength(d);
        const x = p.x + origin.left;
        const y = p.y + origin.top;
        for (const c of cards) {
          const b = c.box;
          // A few pixels in from the edge, where arrows start and end.
          if (x > b.left + 3 && x < b.right - 3 && y > b.top + 3 && y < b.bottom - 3) {
            const problem = `arrow ${i} over "${c.text}"`;
            if (!problems.includes(problem)) problems.push(problem);
          }
        }
      }
    });
    return problems;
  }, cardSelector);
}

/**
 * The persona rows' layout: each row's box and its cards' boxes, to check
 * that cards stay inside their row and rows keep their gaps (the 0.7.0 bug
 * on macOS, where cards spilled over the gaps).
 */
export async function personaRows(page: Page): Promise<{ row: Box; cards: Box[] }[]> {
  return page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    return Array.from(document.querySelectorAll('.persona-row')).map((row) => ({
      row: box(row),
      cards: Array.from(row.querySelectorAll('.card')).map(box),
    }));
  });
}
