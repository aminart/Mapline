// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test, type Page } from '@playwright/test';
import { addActivity, cell, startProject } from './helpers';

/** The texts of the cards of persona row `row`, left to right. */
const rowTexts = (page: Page, row: number) =>
  page.locator('.persona-row').nth(row).locator('.card > textarea').evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value));

const flowTexts = (page: Page) =>
  page.locator('.flow [data-node]').evaluateAll((els) => els.map((el) => el.querySelector('textarea')!.value));

test('copies, pastes and duplicates a map card with the keyboard', async ({ page }) => {
  await startProject(page);
  await addActivity(page, 0, 0, 'Remplit le formulaire');
  await page.getByRole('toolbar').getByRole('button', { name: 'Type' }).click();
  await page.getByRole('button', { name: 'Choix', exact: true }).click();
  const key = page.keyboard;
  await page.locator('.persona-row').nth(0).locator('.card > textarea').first().focus();
  // No text selected: the card is copied, and pasted in a new column right after it.
  await key.press('ControlOrMeta+c');
  await key.press('ControlOrMeta+v');
  await expect.poll(() => rowTexts(page, 0)).toEqual(['Remplit le formulaire', 'Remplit le formulaire']);
  await expect(page.locator('.persona-row').nth(0).locator('.card.card-choice')).toHaveCount(2);
  // The copy is selected: Ctrl+D makes another one next to it.
  await key.press('ControlOrMeta+d');
  await expect.poll(() => rowTexts(page, 0)).toEqual(['Remplit le formulaire', 'Remplit le formulaire', 'Remplit le formulaire']);
  // One undo step each.
  await page.locator('.canvas').click({ position: { x: 5, y: 5 } });
  await key.press('ControlOrMeta+z');
  await expect.poll(() => rowTexts(page, 0)).toHaveLength(2);

  // Pasted in a card just created, the copy takes its place.
  await addActivity(page, 1, 3, '');
  await key.press('ControlOrMeta+v');
  await expect.poll(() => rowTexts(page, 1)).toContain('Remplit le formulaire');
  await expect(cell(page, 1, 3).locator('.card > textarea')).toHaveValue('Remplit le formulaire');
});

test('copying selected text still copies text, not the card', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'native text paste from the keyboard is only reliable in headless Chromium');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await startProject(page);
  await addActivity(page, 0, 0, 'Bonjour');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ControlOrMeta+c');
  await addActivity(page, 1, 0, 'Dit ');
  await page.keyboard.press('ControlOrMeta+v');
  await expect(cell(page, 1, 0).locator('.card > textarea')).toHaveValue('Dit Bonjour');
  await expect.poll(() => rowTexts(page, 0)).toEqual(['Bonjour']);
});

test('pastes a card from one map to another, and into a flow', async ({ page }) => {
  await startProject(page);
  await addActivity(page, 0, 0, 'Reçoit l’e-mail');
  await page.keyboard.press('ControlOrMeta+c');

  await page.locator('.docbar').getByRole('button', { name: 'Nouvelle map' }).click();
  await page.locator('dialog[open] .tpl-card').filter({ hasText: 'Map vide' }).click();
  await expect(page.locator('.doc-tab')).toHaveText(['Map', 'Map 2']);
  await addActivity(page, 0, 0, '');
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(() => rowTexts(page, 0)).toEqual(['Reçoit l’e-mail']);

  await page.locator('.docbar').getByRole('button', { name: 'Nouveau flow' }).click();
  await page.locator('dialog[open] .tpl-card').filter({ hasText: 'Flow vide' }).click();
  await expect(page.locator('.flow')).toBeVisible();
  // Nothing selected: the card goes at the end of the flow.
  await page.locator('.canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(() => flowTexts(page)).toEqual(['Début', 'Fin', 'Reçoit l’e-mail']);
  // A flow card selected: the copy goes to its right, joined by an arrow.
  await expect(page.locator('.flow svg.links .link-line')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+d');
  await expect.poll(() => flowTexts(page)).toEqual(['Début', 'Fin', 'Reçoit l’e-mail', 'Reçoit l’e-mail']);
  await expect(page.locator('.flow svg.links .link-line')).toHaveCount(2);
});
