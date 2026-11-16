// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test, type Page } from '@playwright/test';
import { addActivity, startProject } from './helpers';

const card = (page: Page, row: number) => page.locator('.persona-row').nth(row).locator('.card').first();
const bg = (page: Page, row: number) => card(page, row).evaluate((el) => getComputedStyle(el).backgroundColor);
const fillMenu = (page: Page) => page.getByRole('button', { name: 'Fond', exact: true });

test('offers the colours used in the map as shortcuts, which can be taken off', async ({ page }) => {
  await startProject(page);
  await addActivity(page, 0, 0, 'Lit la pub');
  await addActivity(page, 1, 1, 'Répond');

  await card(page, 0).locator('textarea').click();
  await fillMenu(page).click();
  await page.getByLabel('Fond : Couleur personnalisée').fill('#123abc');
  await expect.poll(() => bg(page, 0)).toBe('rgb(18, 58, 188)');
  await page.keyboard.press('Escape');

  // On another card, the colour is offered among the used ones.
  await card(page, 1).locator('textarea').click();
  await fillMenu(page).click();
  const used = page.getByRole('group', { name: 'Couleurs utilisées' });
  await used.getByRole('button', { name: 'Fond #123ABC' }).click();
  await expect.poll(() => bg(page, 1)).toBe('rgb(18, 58, 188)');

  // Taken off the shortcuts, it stays on both cards.
  await fillMenu(page).click();
  await used.getByRole('button', { name: 'Retirer #123ABC des raccourcis' }).click();
  await expect(used).toHaveCount(0);
  expect(await bg(page, 0)).toBe('rgb(18, 58, 188)');
  expect(await bg(page, 1)).toBe('rgb(18, 58, 188)');
  // Undone like any other change.
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+z');
  await fillMenu(page).click();
  await expect(used.getByRole('button', { name: 'Fond #123ABC' })).toBeVisible();
});

test('the pipette takes a colour from the page where the system has none', async ({ page }) => {
  // Without EyeDropper (WebKit, the Linux app): the in-page pipette.
  await page.addInitScript(() => delete (window as { EyeDropper?: unknown }).EyeDropper);
  await startProject(page);
  await addActivity(page, 0, 0, 'Lit la pub');
  await addActivity(page, 1, 1, 'Répond');

  await card(page, 0).locator('textarea').click();
  await fillMenu(page).click();
  await page.getByLabel('Fond : Couleur personnalisée').fill('#e07a1f');
  await page.keyboard.press('Escape');

  await card(page, 1).locator('textarea').click();
  await fillMenu(page).click();
  await page.getByRole('button', { name: 'Fond : Pipette : prendre une couleur à l’écran' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Cliquez sur la couleur à prendre' })).toBeVisible();
  // The click picks the colour and does nothing else: the first card is not selected.
  await card(page, 0).click({ position: { x: 6, y: 6 } });
  await expect.poll(() => bg(page, 1)).toBe('rgb(224, 122, 31)');
  await expect(card(page, 1)).toHaveClass(/is-selected/);
  await expect(card(page, 0)).not.toHaveClass(/is-selected/);
  await expect(page.locator('.pipette-hint')).toHaveCount(0);

  // Échap cancels.
  await fillMenu(page).click();
  await page.getByRole('button', { name: 'Fond : Pipette : prendre une couleur à l’écran' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.pipette-hint')).toHaveCount(0);
  expect(await bg(page, 1)).toBe('rgb(224, 122, 31)');
});
