// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test, type Page } from '@playwright/test';
import { addActivity, startProject } from './helpers';

/** The texts of the cards of persona row `row`, left to right ('' for an empty cell). */
const rowCells = (page: Page, row: number) =>
  page
    .locator('.persona-row')
    .nth(row)
    .locator('.cell')
    .evaluateAll((els) => els.map((el) => Array.from(el.querySelectorAll<HTMLTextAreaElement>('.card > textarea')).map((t) => t.value).join('|')));


const stepTitles = (page: Page) => page.locator('.step-row .box.step textarea').evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value));

test('picks several cards with Shift + click, then copies, pastes, duplicates and deletes them together', async ({ page }) => {
  await startProject(page);
  await addActivity(page, 0, 0, 'Lit la pub');
  await addActivity(page, 1, 1, 'Répond');
  const key = page.keyboard;
  const first = page.locator('.persona-row').nth(0).locator('.card').first();
  const second = page.locator('.persona-row').nth(1).locator('.card').first();
  await first.locator('textarea').click();
  await second.locator('textarea').click({ modifiers: ['Shift'] });
  await expect(page.locator('.persona-grid .card.is-selected')).toHaveCount(2);
  await expect(page.locator('.tool-kind')).toHaveText('2 sélectionnés');

  // Duplicated as a group, right after it, keeping its shape.
  await key.press('ControlOrMeta+d');
  await expect.poll(() => rowCells(page, 0)).toEqual(expect.arrayContaining(['Lit la pub']));
  const r0 = await rowCells(page, 0);
  const r1 = await rowCells(page, 1);
  expect(r0.filter((t) => t === 'Lit la pub')).toHaveLength(2);
  expect(r1.filter((t) => t === 'Répond')).toHaveLength(2);
  expect(r0.indexOf('Lit la pub', 1) + 1).toBe(r1.lastIndexOf('Répond'));
  // The copies are the new selection.
  await expect(page.locator('.persona-grid .card.is-selected')).toHaveCount(2);

  // Delete removes both, as one undo step.
  await key.press('Delete');
  await expect.poll(async () => (await rowCells(page, 0)).filter((t) => t === 'Lit la pub')).toHaveLength(1);
  expect((await rowCells(page, 1)).filter((t) => t === 'Répond')).toHaveLength(1);
  await key.press('ControlOrMeta+z');
  await expect.poll(async () => (await rowCells(page, 0)).filter((t) => t === 'Lit la pub')).toHaveLength(2);

  // Shift + click again takes a card out of the selection.
  await first.locator('textarea').click();
  await second.locator('textarea').click({ modifiers: ['Shift'] });
  await second.locator('textarea').click({ modifiers: ['Shift'] });
  await expect(page.locator('.persona-grid .card.is-selected')).toHaveCount(1);
});

test('copies several cards and pastes them on another map', async ({ page }) => {
  await startProject(page);
  await addActivity(page, 0, 0, 'Lit la pub');
  await addActivity(page, 0, 1, 'Clique');
  await page.locator('.persona-row').nth(0).locator('.card textarea').first().click();
  await page.locator('.persona-row').nth(0).locator('.card textarea').nth(1).click({ modifiers: ['Shift'] });
  await page.keyboard.press('ControlOrMeta+c');

  await page.locator('.docbar').getByRole('button', { name: 'Nouvelle map' }).click();
  await page.locator('dialog[open] .tpl-card').filter({ hasText: 'Map vide' }).click();
  await addActivity(page, 0, 0, '');
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(async () => (await rowCells(page, 0)).filter(Boolean)).toEqual(['Lit la pub', 'Clique']);
});

test('copies and pastes whole steps and phases', async ({ page }) => {
  await startProject(page);
  const steps = page.locator('.step-row .box.step');
  await steps.nth(0).locator('textarea').fill('Découvre');
  await addActivity(page, 0, 0, 'Lit la pub');
  const before = (await stepTitles(page)).length;
  // Two steps picked, duplicated after the last one.
  await steps.nth(0).locator('textarea').click();
  await steps.nth(1).click({ modifiers: ['Shift'], position: { x: 20, y: 60 } });
  await expect(page.locator('.step-row .box.step.is-selected')).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+c');
  await steps.nth(before - 1).locator('textarea').click();
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(() => stepTitles(page)).toHaveLength(before + 2);
  const titles = await stepTitles(page);
  expect(titles[before]).toBe('Découvre');
  expect((await rowCells(page, 0)).filter((t) => t === 'Lit la pub')).toHaveLength(2);

  // A phase, pasted after the last one, brings its steps.
  const phases = page.locator('.box.phase');
  const nPhases = await phases.count();
  await phases.first().locator('textarea').click();
  await page.keyboard.press('ControlOrMeta+c');
  await phases.last().locator('textarea').click();
  await page.keyboard.press('ControlOrMeta+v');
  await expect(phases).toHaveCount(nPhases + 1);
});

test('picks several flow cards and duplicates them with their arrows', async ({ page }) => {
  await startProject(page);
  await page.locator('.docbar').getByRole('button', { name: 'Nouveau flow' }).click();
  await page.locator('dialog[open] .tpl-card').filter({ hasText: 'Flow vide' }).click();
  const nodes = page.locator('.flow [data-node]');
  await expect(nodes).toHaveCount(2);
  const arrows = await page.locator('.flow svg.links .link-line').count();
  await nodes.nth(0).click();
  await nodes.nth(1).click({ modifiers: ['Shift'] });
  await expect(page.locator('.flow .flow-card.is-selected')).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+d');
  await expect(nodes).toHaveCount(4);
  await expect(page.locator('.flow svg.links .link-line')).toHaveCount(arrows * 2);
});
