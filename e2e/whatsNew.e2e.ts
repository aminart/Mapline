// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test } from '@playwright/test';

const KEY = 'mapline:whats-new';
const band = (page: import('@playwright/test').Page) => page.locator('.whats-new-band');

test('a first install shows no banner', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.start')).toBeVisible();
  await expect(band(page)).toHaveCount(0);
});

test('after an update, the banner lists what is new until it is closed', async ({ page }) => {
  // Seeded once: the version seen before is older than any notes.
  await page.goto('/');
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ from: '0.1.0', to: '0.1.0', opens: 0, done: true })), KEY);
  await page.reload();
  await expect(band(page)).toBeVisible();
  await expect(band(page).locator('.whats-new-tag')).toContainText('Nouveau ·');

  await page.getByRole('button', { name: 'Voir le détail' }).click();
  const card = page.getByRole('dialog', { name: /Nouveautés de Mapline/ });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Compris' }).click();
  await expect(band(page)).toHaveCount(0);
  await expect(card).toHaveCount(0);

  await page.reload();
  await expect(page.locator('.start')).toBeVisible();
  await expect(band(page)).toHaveCount(0);

  // The help menu opens the list again, without the banner.
  await page.getByLabel('Thème, langue et raccourcis clavier').click();
  await page.getByRole('button', { name: 'Nouveautés de la version' }).click();
  await expect(card).toBeVisible();
  await expect(band(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
});

test('the banner goes away by itself after three launches', async ({ page }) => {
  await page.goto('/');
  // An earlier version left its language: this launch counts as an update.
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('missionmap:lang', 'fr');
  });
  for (let i = 0; i < 3; i++) {
    await page.reload();
    await expect(band(page)).toBeVisible();
  }
  await page.reload();
  await expect(page.locator('.start')).toBeVisible();
  await expect(band(page)).toHaveCount(0);
});
