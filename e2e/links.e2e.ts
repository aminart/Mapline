// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test } from '@playwright/test';
import { addActivity, cell, startProject } from './helpers';

const docTab = (page: import('@playwright/test').Page, name: string | RegExp) => page.locator('.doc-tab').filter({ hasText: name }).locator('.doc-tab-btn');
const shots = process.env.LINKS_SHOTS;

test('details a step and a phase in flows, and goes back to the map', async ({ page }) => {
  await startProject(page);
  await page.locator('.step').first().getByRole('textbox', { name: 'Nom de l’étape' }).fill('Prendre rendez-vous');
  await page.locator('.phase').first().getByRole('textbox', { name: 'Nom de la phase' }).fill('Avant la visite');
  await addActivity(page, 0, 0, 'Réserver en ligne');
  // Activity cards stay free of flow links.
  await expect(cell(page, 0, 0).locator('.card').getByRole('button', { name: 'Flows liés' })).toHaveCount(0);

  const step = page.locator('.step').first();
  await step.hover();
  await step.getByRole('button', { name: 'Flows liés' }).click();
  await page.getByRole('menuitem', { name: 'Détailler en nouveau flow' }).click();
  await expect(page.locator('.flow')).toBeVisible();
  await expect(page.locator('.doc-tab')).toContainText(['Flow · Prendre rendez-vous']);
  await expect(page.locator('.flow-source')).toContainText('Étape 1 · Prendre rendez-vous');
  await page.getByRole('textbox', { name: 'Zone de texte libre' }).fill('Réserver en moins de 3 minutes');
  if (shots) await page.screenshot({ path: `${shots}/flow.png` });

  // Back to the map: the step shows its flow.
  await page.locator('.flow-source').click();
  await expect(page.locator('.board')).toBeVisible();
  await expect(step.locator('.flow-chip')).toHaveText('Prendre rendez-vous');

  // A phase, linked to the existing flow: it moves from the step.
  const phase = page.locator('.phase').first();
  await phase.hover();
  await phase.getByRole('button', { name: 'Flows liés' }).click();
  await page.getByRole('menuitem', { name: 'Flow · Prendre rendez-vous' }).click();
  await expect(phase.locator('.flow-chip')).toHaveText('Prendre rendez-vous');
  await expect(step.locator('.flow-chip')).toHaveCount(0);
  if (shots) await page.screenshot({ path: `${shots}/map.png` });

  // Presenting the step's phase offers its flow.
  await page.getByRole('button', { name: 'Présenter' }).click();
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: 'Voir le flow Prendre rendez-vous' }).click();
  await expect(page.locator('.flow')).toBeVisible();
  await page.keyboard.press('Escape');

  // Merging the phase away asks first, and leaves the flow unlinked.
  await docTab(page, 'Map').click();
  page.once('dialog', (d) => {
    expect(d.message()).toContain('Prendre rendez-vous');
    void d.accept();
  });
  await phase.hover();
  await phase.getByRole('button', { name: 'Fusionner cette phase avec la voisine' }).click();
  await expect(page.locator('.phase .flow-chip')).toHaveCount(0);
  await docTab(page, 'Prendre rendez-vous').click();
  await expect(page.locator('.flow-source')).toHaveCount(0);
});

test('links a persona’s sheet to the flows they are in', async ({ page }) => {
  await startProject(page);
  await page.locator('.persona-row').first().getByRole('textbox', { name: 'Nom du persona' }).fill('Patiente');
  await page.locator('.step').nth(1).getByRole('textbox', { name: 'Nom de l’étape' }).fill('Arriver');
  const step = page.locator('.step').nth(1);
  await step.hover();
  await step.getByRole('button', { name: 'Flows liés' }).click();
  await page.getByRole('menuitem', { name: 'Détailler en nouveau flow' }).click();
  await page.getByRole('combobox', { name: 'Persona principal du flow' }).selectOption({ label: 'Patiente' });
  await docTab(page, 'Map').click();
  await page.locator('.persona').first().hover();
  await page.getByRole('button', { name: 'Créer sa fiche' }).first().click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Créer la fiche' }).click();
  const flows = page.locator('.sheet-identity .sheet-flow');
  await expect(flows).toHaveText(['Arriver']);
  if (shots) await page.screenshot({ path: `${shots}/sheet.png` });
  // Its tags are edited like a card's.
  await page.locator('.sheet-identity').getByRole('textbox', { name: 'Ajouter un tag' }).fill('Mobile');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Modifier le tag Mobile' }).click();
  await page.getByRole('textbox', { name: 'Nom du tag' }).fill('Smartphone');
  await page.keyboard.press('Enter');
  await expect(page.locator('.sheet-identity .tag')).toHaveText(['Smartphone']);
  await flows.first().click();
  await expect(page.locator('.flow')).toBeVisible();
});

test('renames a tag and changes its colour from the card', async ({ page }) => {
  await startProject(page);
  await addActivity(page, 0, 0, 'Une');
  await addActivity(page, 0, 1, 'Deux');
  for (const col of [0, 1]) {
    const c = cell(page, 0, col).locator('.card');
    await c.hover();
    await c.getByRole('button', { name: 'Ajouter un tag' }).click();
    await page.keyboard.type('irritant');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
  }
  const first = cell(page, 0, 0).locator('.card');
  await first.getByRole('button', { name: 'Modifier le tag irritant' }).click();
  const editor = page.getByRole('dialog', { name: 'Modifier le tag irritant' });
  await editor.getByRole('button', { name: 'Couleur de « irritant » 3' }).click();
  if (shots) await page.screenshot({ path: `${shots}/tag.png` });
  // Only this card.
  await editor.getByRole('checkbox', { name: 'Sur toutes les cartes (2)' }).uncheck();
  await editor.getByRole('textbox', { name: 'Nom du tag' }).fill('Douleur');
  await page.keyboard.press('Enter');
  await expect(first.locator('.tag')).toHaveText('Douleur');
  await expect(cell(page, 0, 1).locator('.tag')).toHaveText('irritant');
  const [a, b] = await Promise.all([first.locator('.tag').evaluate((e) => getComputedStyle(e).backgroundColor), cell(page, 0, 1).locator('.tag').evaluate((e) => getComputedStyle(e).backgroundColor)]);
  expect(a).toBe(b);
  // Everywhere.
  await cell(page, 0, 1).getByRole('button', { name: 'Modifier le tag irritant' }).click();
  await page.getByRole('textbox', { name: 'Nom du tag' }).fill('Douleur');
  await page.keyboard.press('Enter');
  await expect(cell(page, 0, 1).locator('.tag')).toHaveText('Douleur');
});
