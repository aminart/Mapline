// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test } from '@playwright/test';
import { addActivity, cell, startProject } from './helpers';

const docTab = (page: import('@playwright/test').Page, name: string | RegExp) => page.locator('.doc-tab').filter({ hasText: name }).locator('.doc-tab-btn');
const shots = process.env.LINKS_SHOTS;

test('details an activity, a step and a phase in flows, and goes back to the map', async ({ page }) => {
  await startProject(page);
  await page.locator('.persona-row').first().getByRole('textbox', { name: 'Nom du persona' }).fill('Patiente');
  await page.locator('.step').first().getByRole('textbox', { name: 'Nom de l’étape' }).fill('Prendre rendez-vous');
  await page.locator('.phase').first().getByRole('textbox', { name: 'Nom de la phase' }).fill('Avant la visite');
  await addActivity(page, 0, 0, 'Réserver en ligne');

  // An activity: the new flow is named after it and takes its persona.
  const card = cell(page, 0, 0).locator('.card');
  await card.hover();
  await card.getByRole('button', { name: 'Flows liés' }).click();
  await page.getByRole('menuitem', { name: 'Détailler en nouveau flow' }).click();
  await expect(page.locator('.flow')).toBeVisible();
  await expect(page.locator('.doc-tab')).toContainText(['Flow · Réserver en ligne']);
  await expect(page.locator('.flow-source')).toContainText('Activité · Réserver en ligne');
  await expect(page.getByRole('combobox', { name: 'Persona principal du flow' })).toHaveValue(/.+/);
  await page.getByRole('textbox', { name: 'Zone de texte libre' }).fill('Réserver en moins de 3 minutes');
  if (shots) await page.screenshot({ path: `${shots}/flow.png` });

  // Back to the map: the card shows its flow.
  await page.locator('.flow-source').click();
  await expect(page.locator('.board')).toBeVisible();
  await expect(card.locator('.flow-chip')).toHaveText('Réserver en ligne');

  // A step and a phase.
  const step = page.locator('.step').first();
  await step.hover();
  await step.getByRole('button', { name: 'Flows liés' }).click();
  await page.getByRole('menuitem', { name: 'Détailler en nouveau flow' }).click();
  await expect(page.locator('.flow-source')).toContainText('Étape 1 · Prendre rendez-vous');
  await docTab(page, 'Map').click();
  const phase = page.locator('.phase').first();
  await phase.hover();
  await phase.getByRole('button', { name: 'Flows liés' }).click();
  // An existing flow can be linked too.
  await page.getByRole('menuitem', { name: 'Flow · Prendre rendez-vous' }).click();
  await expect(phase.locator('.flow-chip')).toHaveText('Prendre rendez-vous');
  await expect(step.locator('.flow-chip')).toHaveCount(0);
  if (shots) await page.screenshot({ path: `${shots}/map.png` });
});

test('lists a persona’s journeys on their sheet, and hides them', async ({ page }) => {
  await startProject(page);
  await page.locator('.persona-row').first().getByRole('textbox', { name: 'Nom du persona' }).fill('Patiente');
  await page.locator('.step').nth(1).getByRole('textbox', { name: 'Nom de l’étape' }).fill('Arriver');
  await addActivity(page, 0, 1, 'Trouver le bâtiment');
  const card = cell(page, 0, 1).locator('.card');
  await card.hover();
  await card.getByRole('button', { name: 'Flows liés' }).click();
  await page.getByRole('menuitem', { name: 'Détailler en nouveau flow' }).click();
  await docTab(page, 'Map').click();
  await page.locator('.persona').first().hover();
  await page.getByRole('button', { name: 'Créer sa fiche' }).first().click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Créer la fiche' }).click();
  const journeys = page.locator('.sheet-journeys');
  await expect(journeys.locator('.journey-steps li')).toHaveText(['2 · Arriver']);
  await expect(journeys.locator('.journey-flow')).toContainText('Flow · Trouver le bâtiment');
  if (shots) await page.screenshot({ path: `${shots}/sheet.png` });
  await journeys.getByRole('switch').click();
  await expect(journeys).toHaveCount(0);
  await page.getByRole('button', { name: 'Afficher ses parcours' }).click();
  await expect(page.locator('.sheet-journeys')).toBeVisible();
  await page.locator('.journey-flow').click();
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
