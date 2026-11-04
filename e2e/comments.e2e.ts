// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test } from '@playwright/test';
import { addActivity, cell, startProject } from './helpers';

test('lists the notes of the project in one panel and marks them resolved', async ({ page }) => {
  await startProject(page);
  await addActivity(page, 0, 0, 'Remplit le formulaire');
  const card = cell(page, 0, 0).locator('.card');
  await card.hover();
  await card.getByRole('button', { name: 'Ajouter une note' }).click();
  await page.getByRole('dialog', { name: 'Note' }).locator('textarea').fill('Trop de champs obligatoires ?');
  await page.mouse.click(5, 300);

  const button = page.getByRole('button', { name: 'Commentaires', exact: true });
  await expect(button.locator('.comments-count')).toHaveText('1');
  await button.click();
  const panel = page.getByRole('complementary', { name: 'Commentaires' });
  await expect(panel.locator('.comment')).toHaveCount(1);
  await expect(panel.locator('.comment')).toContainText('Remplit le formulaire');
  await expect(panel.locator('.comment')).toContainText('Trop de champs obligatoires ?');

  await panel.getByRole('button', { name: 'Marquer comme résolu' }).click();
  await expect(panel.getByText('Tous les commentaires sont résolus.')).toBeVisible();
  await expect(button.locator('.comments-count')).toHaveCount(0);
  await expect(card.locator('.note')).toHaveClass(/is-resolved/);

  await panel.getByRole('button', { name: /Résolus/ }).click();
  await expect(panel.locator('.comment.is-resolved')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Rouvrir le commentaire' }).click();
  await expect(panel.locator('.comment')).toHaveCount(0);
  await expect(card.locator('.note')).not.toHaveClass(/is-resolved/);

  // From the card's note too.
  await card.locator('.note-btn').click();
  await page.getByRole('dialog', { name: 'Note' }).getByRole('button', { name: 'Marquer comme résolue' }).click();
  await expect(card.locator('.note')).toHaveClass(/is-resolved/);
  await expect(panel.locator('.comment.is-resolved')).toHaveCount(1);

  // Going to the card selects it.
  await panel.locator('.comment-go').click();
  await expect(card).toHaveClass(/is-selected/);
});
