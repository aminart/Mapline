// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test, type Page } from '@playwright/test';
import { addActivity, startProject } from './helpers';

const SHOTS = process.env.STATE_SHOTS;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${test.info().project.name}.png` });
}

test('compares a map’s target state with its current state', async ({ page }) => {
  await startProject(page);
  await addActivity(page, 0, 0, 'Appelle le cabinet');
  await addActivity(page, 0, 1, 'Attend qu’on le rappelle');
  const firstText = await page.locator('.persona-grid [data-act] textarea').first().inputValue();
  await page.getByRole('button', { name: 'Créer l’état cible' }).click();
  // The copy opens, tagged as the target, next to its current state.
  await expect(page.locator('.doc-tab.is-active')).toContainText('Cible');
  await expect(page.locator('.doc-tab').first()).toContainText('Actuel');
  await expect(page.locator('.state-bar')).toContainText('Comparé à');
  await expect(page.locator('.state-legend')).toHaveText(/0 ajoutée.*0 modifiée.*0 supprimée/);

  const cards = page.locator('.persona-grid [data-act]');
  // Change the first card, remove the second.
  await cards.first().locator('textarea').fill('Réserve en 3 clics');
  const removedText = await cards.nth(1).locator('textarea').inputValue();
  await cards.nth(1).hover();
  await cards.nth(1).getByRole('button', { name: 'Supprimer l’activité' }).click();
  await expect(page.locator('.state-legend')).toHaveText(/0 ajoutée.*1 modifiée.*1 supprimée/);
  await expect(cards.first()).toHaveClass(/diff-modified/);
  await expect(cards.first().locator('.change-before')).toHaveText(firstText);
  const ghost = page.locator('.removed-card');
  await expect(ghost).toHaveCount(1);
  await expect(ghost).toContainText(removedText);
  await shot(page, 'map-compare');

  // Without comparing, the board looks as usual.
  await page.getByLabel('Comparer avec l’état actuel').uncheck();
  await expect(page.locator('.removed-card, .diff-modified')).toHaveCount(0);
  await page.getByLabel('Comparer avec l’état actuel').check();

  // A removed card can be put back.
  await ghost.hover();
  await ghost.getByRole('button', { name: 'Restaurer' }).click();
  await expect(page.locator('.removed-card')).toHaveCount(0);
  await expect(page.locator('.state-legend')).toHaveText(/0 ajoutée.*1 modifiée.*0 supprimée/);

  // The current state is unchanged, and leads to its target.
  await page.locator('.doc-tab').first().locator('.doc-tab-btn').click();
  await expect(page.locator('.state-bar')).toHaveCount(0);
  await expect(page.locator('.persona-grid [data-act] textarea').first()).toHaveValue(firstText);
  await page.getByRole('button', { name: 'Voir l’état cible' }).click();
  await expect(page.locator('.state-bar')).toBeVisible();
});

test('compares a flow’s target state with its current state', async ({ page }) => {
  await page.goto('/');
  await page.locator('.start').getByRole('button', { name: 'Flow', exact: true }).click();
  await page.locator('.start .tpl-card').filter({ hasText: 'Flow utilisateur' }).click();
  await expect(page.locator('.flow')).toBeVisible();
  await page.getByRole('button', { name: 'Créer l’état cible' }).click();
  await expect(page.locator('.doc-tab.is-active')).toContainText('Cible');

  const cards = page.locator('.flow [data-node]');
  const activity = page.locator('.flow [data-node].flow-activity').first();
  await activity.locator('textarea').fill('Ouvre l’app');
  await expect(activity).toHaveClass(/diff-modified/);
  const last = page.locator('.flow [data-node].flow-activity').last();
  await last.hover();
  await last.getByRole('button', { name: 'Supprimer la carte' }).click();
  const choice = page.locator('.flow [data-node].flow-choice').first();
  await choice.locator('textarea').click();
  await choice.getByRole('button', { name: 'Ajouter une carte en dessous' }).click();
  await page.keyboard.type('Nouvelle étape');
  await expect(page.locator('.flow [data-node].diff-added')).toHaveCount(1);
  // The current state is shown above, read only, the removed card marked.
  const base = page.locator('.canvas-base');
  await expect(base.locator('[data-base-node]')).toHaveCount(7);
  await expect(base.locator('.diff-removed')).toHaveCount(1);
  await expect(base.locator('.diff-modified')).toHaveCount(1);
  // Its cards keep their outline, as in the flow below.
  const baseActivity = base.locator('[data-base-node].flow-activity:not(.diff-removed)').last();
  await expect(baseActivity).toHaveCSS('border-left-color', 'rgb(221, 225, 231)');
  await expect(page.locator('.state-legend')).toHaveText(/1 ajoutée.*1 modifiée.*1 supprimée/);
  await expect(cards).toHaveCount(7);
  await shot(page, 'flow-compare');
  // Both panes scroll sideways together.
  const bottom = page.locator('.canvas-pane').nth(1);
  await bottom.evaluate((el) => (el.scrollLeft = 120));
  await expect.poll(() => base.evaluate((el) => el.scrollLeft)).toBe(await bottom.evaluate((el) => el.scrollLeft));
  // The removed card can be put back from there.
  await base.locator('.diff-removed').hover();
  await base.getByRole('button', { name: 'Restaurer' }).click();
  await expect(base.locator('.diff-removed')).toHaveCount(0);
  await expect(page.locator('.flow [data-node]')).toHaveCount(8);
  // Without comparing, the flow is shown alone.
  await page.getByLabel('Comparer avec l’état actuel').uncheck();
  await expect(page.locator('.canvas-base')).toHaveCount(0);
});
