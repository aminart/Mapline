// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { clippedFields, fillWithLongText, startProject, openProjects } from './helpers';

/** Creates the sheet of the first persona of the map, from its button. */
async function createFirstSheet(page: Page) {
  await page.locator('.persona').first().hover();
  await page.getByRole('button', { name: 'Créer sa fiche' }).first().click();
  await expect(page.getByRole('heading', { name: 'Nouvelle fiche persona' })).toBeVisible();
  await page.locator('dialog[open]').getByRole('button', { name: 'Créer la fiche' }).click();
  await expect(page.locator('.sheet')).toBeVisible();
}

const docTab = (page: Page, name: string | RegExp) => page.locator('.doc-tab').filter({ hasText: name }).locator('.doc-tab-btn');

test('creates the sheet of a map persona, and keeps its name in sync', async ({ page }) => {
  await startProject(page);
  await page.locator('.persona-row').first().getByRole('textbox', { name: 'Nom du persona' }).fill('Patient');
  await createFirstSheet(page);
  await expect(page.locator('.doc-tab')).toHaveText(['Map', 'Fiche · Patient']);
  await expect(page.getByText('Liée à Patient')).toBeVisible();
  await page.locator('.sheet').getByRole('textbox', { name: 'Nom du persona' }).fill('Patiente');
  await expect(page.locator('.doc-tab')).toHaveText(['Map', 'Fiche · Patiente']);
  await docTab(page, 'Map').click();
  await expect(page.locator('.persona-row').first().getByRole('textbox', { name: 'Nom du persona' })).toHaveValue('Patiente');
});

test('fills a sheet: lines, gauges, display, undo', async ({ page }) => {
  await startProject(page);
  await createFirstSheet(page);
  const goals = page.getByRole('textbox', { name: 'Ligne de Objectifs' });
  await goals.first().fill('Trouver un créneau');
  await goals.first().press('Enter');
  await page.keyboard.type('Réserver vite');
  await expect(goals).toHaveCount(2);
  await page.keyboard.press('Enter');
  await expect(goals).toHaveCount(3);
  // Backspace in an empty line removes it.
  await page.keyboard.press('Backspace');
  await expect(goals).toHaveCount(2);
  await expect(goals.nth(1)).toHaveValue('Réserver vite');

  await page.getByRole('textbox', { name: 'Ligne de Motivations' }).first().fill('Rapidité');
  await page.getByRole('slider', { name: 'Niveau : Rapidité' }).fill('80');
  await expect(page.locator('.sheet-gauge-fill').first()).toHaveAttribute('style', /width: 80%/);

  // The selected block's display, from the toolbar.
  await goals.first().click();
  await page.getByRole('toolbar').getByRole('button', { name: 'Tags', exact: true }).click();
  await expect(page.locator('.sheet-block').first().locator('.tag')).toHaveText(['Trouver un créneau', 'Réserver vite']);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(goals).toHaveCount(2);
});

test('opens a sheet from the map', async ({ page }) => {
  await startProject(page);
  await createFirstSheet(page);
  await page.getByPlaceholder('« Une phrase qui résume ce persona »').fill('« Vite et bien »');
  await page.getByRole('textbox', { name: 'Ligne de Motivations' }).first().fill('Autonomie');
  await page.locator('.sheet-block').getByRole('textbox', { name: 'Ajouter un tag' }).fill('Téléphone');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Ajouter un bloc' }).click();
  await page.getByRole('group', { name: 'Ajouter un bloc' }).getByRole('button', { name: 'Liste' }).click();
  await page.getByRole('textbox', { name: 'Titre du bloc' }).last().fill('Freins');
  await page.getByRole('textbox', { name: 'Ligne de Freins' }).fill('Peur de se tromper');
  await docTab(page, 'Map').click();
  await page.getByRole('button', { name: /Voir la fiche de/ }).first().click();
  const preview = page.getByRole('complementary', { name: 'Fiche persona' });
  await expect(preview).toContainText('« Vite et bien »');
  // Every block with content: gauges, tags and blocks added to the template too.
  await expect(preview.getByRole('meter', { name: 'Autonomie' })).toHaveAttribute('aria-valuenow', '50');
  await expect(preview.locator('[data-view="tags"] .tag')).toHaveText(['Téléphone']);
  await expect(preview.locator('.sheet-preview-block').filter({ hasText: 'Freins' })).toContainText('Peur de se tromper');
  await expect(preview.locator('.sheet-preview-title')).toHaveText(['Motivations', 'Canaux et outils', 'Freins', 'Présent dans la map']);
  await preview.getByRole('button', { name: 'Ouvrir la fiche complète' }).click();
  await expect(page.locator('.sheet')).toBeVisible();
});

test('a persona sheet project, saved and opened again', async ({ page }, info) => {
  await page.goto('/');
  await page.locator('.start').getByRole('button', { name: 'Fiche persona', exact: true }).click();
  await page.locator('.start .tpl-card').first().click();
  await expect(page.locator('.sheet')).toBeVisible();
  await expect(page.getByText('Fiche indépendante')).toBeVisible();
  await page.locator('.sheet').getByRole('textbox', { name: 'Nom du persona' }).fill('Camille');
  await page.getByRole('textbox', { name: 'Ligne de Frustrations' }).first().fill('Trop d’appels');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  const file = info.outputPath('fiche.mapline');
  await (await download).saveAs(file);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  expect(saved.docs.map((d: { kind: string }) => d.kind)).toEqual(['persona']);

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Ouvrir', exact: true }).click();
  await (await chooser).setFiles(file);
  await expect(await openProjects(page)).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('.sheet').getByRole('textbox', { name: 'Nom du persona' })).toHaveValue('Camille');
  await expect(page.getByRole('textbox', { name: 'Ligne de Frustrations' }).first()).toHaveValue('Trop d’appels');
});

test('blocks never overlap, however long their text', async ({ page }) => {
  await startProject(page);
  await createFirstSheet(page);
  await page.getByRole('textbox', { name: 'Ligne de Objectifs' }).first().fill('Un objectif très long qui doit agrandir le bloc sans jamais passer sous le bloc du dessous. '.repeat(4));
  await page.getByRole('textbox', { name: 'Scénario' }).fill('Ligne 1\nLigne 2\nLigne 3\nLigne 4\nLigne 5\nLigne 6');
  const boxes = await page.locator('.sheet-block').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlap = a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
      expect(overlap, `blocks ${i} and ${j} overlap`).toBe(false);
    }
  }
});

test('exports a sheet as PNG and PDF', async ({ page }) => {
  await startProject(page);
  await createFirstSheet(page);
  await page.keyboard.press('ControlOrMeta+e');
  await expect(page.locator('input[name=export-format][value=csv]')).toHaveCount(0);
  for (const [format, magic] of [
    ['png', 'PNG'],
    ['pdf', '%PDF'],
  ] as const) {
    if (format === 'pdf') await page.keyboard.press('ControlOrMeta+e');
    await page.locator(`input[name=export-format][value=${format}]`).check({ force: true });
    const download = page.waitForEvent('download');
    await page.locator('dialog[open] .btn-primary').click();
    const bytes = await readFile(await (await download).path());
    expect(bytes.subarray(format === 'png' ? 1 : 0, format === 'png' ? 4 : 4).toString()).toBe(magic);
  }
});

test('asks before deleting a sheet', async ({ page }) => {
  await startProject(page);
  await createFirstSheet(page);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('.doc-tab').nth(1).getByRole('button', { name: /^Supprimer/ }).click();
  await expect(page.locator('.doc-tab')).toHaveCount(2);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('.doc-tab').nth(1).getByRole('button', { name: /^Supprimer/ }).click();
  await expect(page.locator('.doc-tab')).toHaveCount(1);
  await expect(page.locator('.board')).toBeVisible();
});

test('picks the persona of a new sheet from a list', async ({ page }) => {
  await startProject(page);
  await page.locator('.docbar').getByRole('button', { name: 'Nouvelle fiche persona' }).click();
  const target = page.getByRole('combobox', { name: 'Pour quel persona ?' });
  await expect(target).toHaveValue(/\|/);
  await target.selectOption({ label: 'Front office' });
  await page.locator('dialog[open]').getByRole('button', { name: 'Créer la fiche' }).click();
  await expect(page.locator('.doc-tab')).toHaveText(['Map', 'Fiche · Front office']);
});

/** A small PNG, drawn in the page. */
async function pngFile(page: Page): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#C2410C';
    ctx.fillRect(0, 0, 64, 64);
    return c.toDataURL('image/png').split(',')[1];
  });
  return { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}

test('a sheet photo shows on the persona everywhere in the project', async ({ page }) => {
  await startProject(page);
  await createFirstSheet(page);
  await expect(page.locator('.sheet-avatar')).toHaveCSS('cursor', 'pointer');
  await page.locator('.sheet-avatar input[type=file]').setInputFiles(await pngFile(page));
  await expect(page.locator('.sheet-avatar img')).toBeVisible();
  await expect(page.locator('.busy')).toHaveCount(0);
  await docTab(page, 'Map').click();
  await expect(page.locator('.persona').first().locator('.avatar img')).toBeVisible();
  // A flow card done by this persona shows the photo too.
  await page.locator('.docbar').getByRole('button', { name: 'Nouveau flow' }).click();
  await page.locator('dialog[open] .tpl-card').filter({ hasText: 'Flow utilisateur' }).click();
  await page.locator('.flow [data-node]').nth(1).locator('textarea').click();
  await page.getByRole('combobox', { name: 'Persona', exact: true }).selectOption({ index: 1 });
  await expect(page.locator('.flow [data-node]').nth(1).locator('.flow-persona img')).toBeVisible();
});

test('gives the sheet tags a colour of their choice', async ({ page }) => {
  await startProject(page);
  await createFirstSheet(page);
  const chips = page.locator('.sheet-identity .sheet-chips');
  await chips.getByRole('textbox', { name: 'Ajouter un tag' }).fill('Senior');
  await page.keyboard.press('Enter');
  // A click on the tag opens the same editor as on map and flow cards.
  await chips.getByRole('button', { name: 'Modifier le tag Senior' }).click();
  await chips.getByRole('button', { name: 'Couleur de « Senior » 5' }).click();
  await expect(chips.locator('.tag').filter({ hasText: 'Senior' })).toHaveCSS('background-color', 'rgb(255, 241, 191)');
  await page.keyboard.press('Escape');
  await expect(chips.locator('.tag-editor')).toHaveCount(0);
});

test('shows every text of a sheet in full, the persona name included', async ({ page }) => {
  await startProject(page);
  await createFirstSheet(page);
  await fillWithLongText(page, '.sheet');
  expect(await clippedFields(page, '.sheet')).toEqual([]);
});

test('moves a block to any cell and resizes it across columns and rows', async ({ page }) => {
  await startProject(page);
  await createFirstSheet(page);
  const blocks = page.locator('.sheet-block');
  const scenario = blocks.nth(5);
  const goals = blocks.nth(0);
  const start = (await goals.boundingBox())!;
  // Drag the scenario block by its grip to where the goals block is.
  const grip = scenario.locator('.grip');
  await scenario.hover();
  const g = (await grip.boundingBox())!;
  const s = (await scenario.boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + (g.x - s.x) + 20, start.y + (g.y - s.y) + 10, { steps: 8 });
  await expect(page.locator('.sheet-drop-ghost')).toBeVisible();
  await page.mouse.up();
  await expect(blocks.first().locator('.sheet-block-title')).toHaveValue('Scénario');
  const moved = (await blocks.first().boundingBox())!;
  expect(Math.abs(moved.x - start.x)).toBeLessThan(2);
  expect(Math.abs(moved.y - start.y)).toBeLessThan(2);

  // Resize it from its corner: two columns wider, one row taller.
  const first = blocks.first();
  await first.hover();
  const corner = (await first.locator('.sheet-resize').boundingBox())!;
  const cols = await page.locator('.sheet-blocks').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').map(parseFloat));
  await page.mouse.move(corner.x + 4, corner.y + 4);
  await page.mouse.down();
  await page.mouse.move(corner.x + (cols[0] + 14) * 2, corner.y + 100, { steps: 8 });
  await page.mouse.up();
  const wide = (await first.boundingBox())!;
  expect(wide.width).toBeGreaterThan(moved.width * 1.8);
  expect(wide.height).toBeGreaterThan(moved.height);
  // No two blocks overlap.
  const boxes = await blocks.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i], boxes[j]];
      expect(a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1, `blocks ${i} and ${j} overlap`).toBe(false);
    }
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  // Undo puts it back to its first size.
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await blocks.first().boundingBox())!.width).toBeLessThan(wide.width);
});
