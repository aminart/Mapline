// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test } from '@playwright/test';
import { addActivity, cell, startProject } from './helpers';

test('reopens the projects of the last session after a reload', async ({ page }) => {
  await startProject(page);
  await addActivity(page, 0, 0, 'Réserver en ligne');
  // The copy is written half a second after the last change.
  await page.waitForTimeout(800);
  await page.reload();
  await expect(cell(page, 0, 0).getByRole('textbox', { name: 'Activité' })).toHaveValue('Réserver en ligne');
  // A change after the reload is kept too.
  await cell(page, 0, 0).getByRole('textbox', { name: 'Activité' }).fill('Réserver par téléphone');
  await page.waitForTimeout(800);
  await page.reload();
  await expect(cell(page, 0, 0).getByRole('textbox', { name: 'Activité' })).toHaveValue('Réserver par téléphone');
});

test('reopens a session saved in local storage by an earlier version, then moves it', async ({ page }) => {
  await page.goto('/');
  await startProject(page);
  await addActivity(page, 0, 0, 'Ancienne session');
  await page.waitForTimeout(800);
  // Make the session look like one saved before 1.3.1: in local storage only.
  await page.evaluate(async () => {
    const project = await new Promise<unknown>((resolve) => {
      const open = indexedDB.open('mapline', 1);
      open.onsuccess = () => {
        const store = open.result.transaction('session', 'readonly').objectStore('session');
        const index = store.get('index');
        index.onsuccess = () => {
          const key = (index.result as { tabs: { key: string }[] }).tabs[0].key;
          const p = store.get(key);
          p.onsuccess = () => resolve(p.result);
        };
      };
    });
    localStorage.setItem('missionmap:session', JSON.stringify({ active: 0, tabs: [{ project, filePath: null, dirty: true }] }));
    await new Promise<void>((resolve) => {
      const open = indexedDB.open('mapline', 1);
      open.onsuccess = () => {
        const tx = open.result.transaction('session', 'readwrite');
        tx.objectStore('session').clear();
        tx.oncomplete = () => resolve();
      };
    });
  });
  await page.reload();
  await expect(cell(page, 0, 0).getByRole('textbox', { name: 'Activité' })).toHaveValue('Ancienne session');
  await cell(page, 0, 0).getByRole('textbox', { name: 'Activité' }).fill('Ancienne session, déplacée');
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => localStorage.getItem('missionmap:session'))).toBeNull();
  await page.reload();
  await expect(cell(page, 0, 0).getByRole('textbox', { name: 'Activité' })).toHaveValue('Ancienne session, déplacée');
});
