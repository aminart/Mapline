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
  await page.getByLabel('Comparer avec l’état actuel').check();
  // No longer compared, the target can be compared again.
  page.once('dialog', (d) => d.accept());
  await page.locator('.state-bar').getByRole('button', { name: 'Ne plus comparer' }).click();
  await expect(page.locator('.state-bar')).toHaveCount(0);
  await expect(page.locator('.canvas-base')).toHaveCount(0);
  await page.getByRole('button', { name: 'Comparer à nouveau' }).click();
  await expect(page.locator('.state-bar')).toContainText('Comparé à');
  await expect(page.locator('.canvas-base [data-base-node]')).toHaveCount(7);
});

test('reads a flow’s comparison: changes only, arrows, from change to change, overlaid', async ({ page }) => {
  await page.goto('/');
  await page.locator('.start').getByRole('button', { name: 'Flow', exact: true }).click();
  await page.locator('.start .tpl-card').filter({ hasText: 'Flow utilisateur' }).click();
  await expect(page.locator('.flow')).toBeVisible();
  await page.getByRole('button', { name: 'Créer l’état cible' }).click();
  const activity = page.locator('.flow [data-node].flow-activity').first();
  await activity.locator('textarea').fill('Ouvre l’app');
  const last = page.locator('.flow [data-node].flow-activity').last();
  await last.hover();
  await last.getByRole('button', { name: 'Supprimer la carte' }).click();
  const bar = page.locator('.state-bar');
  await expect(bar).toContainText('Flèches :');

  // Changes only: the unchanged cards fade, the changed one doesn't.
  await bar.getByLabel('Changements seulement').check();
  const same = page.locator('.canvas:not(.canvas-base) [data-node].diff-same').first();
  await expect.poll(() => same.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(0.5);
  await expect.poll(() => activity.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1);
  // Arrows removed with the card are dashed grey in the current state.
  await expect(page.locator('.canvas-base .diff-removed-link').first()).toBeAttached();

  // From change to change.
  await expect(bar.locator('.state-nav-pos')).toHaveText('2 changements');
  await bar.getByRole('button', { name: 'Changement suivant' }).click();
  await expect(bar.locator('.state-nav-pos')).toHaveText('1 / 2');
  await expect(activity).toHaveClass(/diff-flash/);
  await bar.getByRole('button', { name: '1 supprimée' }).click();
  await expect(page.locator('.canvas-base [data-base-node].diff-removed')).toHaveClass(/diff-flash/);

  // Hovering a card outlines its other version above.
  await activity.hover();
  await expect(page.locator(`.canvas-base [data-base-node="${await activity.getAttribute('data-node')}"]`)).toHaveClass(/is-twin/);

  // The current state can be folded away, and back.
  await page.getByRole('button', { name: 'Replier l’état actuel' }).click();
  await expect(page.locator('.canvas-base')).toHaveCount(0);
  await page.getByRole('button', { name: 'Déplier l’état actuel' }).click();
  await expect(page.locator('.canvas-base')).toHaveCount(1);
  await bar.getByLabel('Changements seulement').uncheck();
  await shot(page, 'flow-compare-tools');

  // Overlaid: one canvas, the removed card drawn in it, and it can be put back.
  await bar.getByRole('button', { name: 'Superposés' }).click();
  await expect(page.locator('.canvas-base')).toHaveCount(0);
  const ghost = page.locator('.flow [data-ghost-node]');
  await expect(ghost).toHaveCount(1);
  await ghost.scrollIntoViewIfNeeded();
  await shot(page, 'flow-compare-merged');
  await ghost.getByRole('button', { name: 'Restaurer' }).click();
  await expect(ghost).toHaveCount(0);
  await expect(page.locator('.flow [data-node]')).toHaveCount(7);
  await bar.getByRole('button', { name: 'Deux panneaux' }).click();
  await expect(page.locator('.canvas-base')).toHaveCount(1);
});
