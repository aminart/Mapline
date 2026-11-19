// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { startProject, addDocument } from './helpers';

/** Opens the app on a new sitemap project: its first screen is ready to be named. */
async function startSitemap(page: Page) {
  await page.goto('/');
  await page.locator('.kind-switch').getByRole('button', { name: 'Arborescence' }).click();
  await page.locator('.start .tpl-card').first().click();
  await expect(page.locator('.sitemap-card')).toHaveCount(1);
}

const toolbar = (page: Page) => page.locator('.toolbar').first();
const card = (page: Page, name: string) => page.locator('.sitemap-card').filter({ has: page.locator(`textarea:text-is("${name}")`) });

async function addChild(page: Page, name: string) {
  await toolbar(page).getByRole('button', { name: 'Ajouter un sous-écran' }).click();
  await page.keyboard.type(name);
}

async function addSibling(page: Page, name: string) {
  await toolbar(page).getByRole('button', { name: 'Ajouter un écran au même niveau' }).click();
  await page.keyboard.type(name);
}

/** Selects a screen by clicking its card away from its name. */
async function pick(page: Page, name: string) {
  await card(page, name).click({ position: { x: 8, y: 60 } });
}

/** Home, with two sections under it and two screens in the first. */
async function buildTree(page: Page) {
  await page.keyboard.type('Accueil');
  await addChild(page, 'Catalogue');
  await addChild(page, 'Liste');
  await addSibling(page, 'Fiche produit');
  await pick(page, 'Catalogue');
  await addSibling(page, 'Mon compte');
}

test('builds a sitemap: screens named on their card, counted by level', async ({ page }) => {
  await startSitemap(page);
  await buildTree(page);
  await expect(page.locator('.sitemap-card')).toHaveCount(5);
  await expect(page.locator('.sitemap-summary')).toContainText('Niveau 2 · 2');
  await expect(page.locator('.sitemap-summary')).toContainText('Niveau 3 · 2');
  // One line, as the other toolbars.
  expect((await toolbar(page).boundingBox())!.height).toBe(48);

  // Status, global screen, a message on a screen.
  await pick(page, 'Accueil');
  await toolbar(page).getByRole('button', { name: 'Statut' }).click();
  await page.locator('.tool-menu-panel').getByRole('button', { name: 'Existant', exact: true }).click();
  await expect(card(page, 'Accueil')).toHaveClass(/is-existing/);
  await pick(page, 'Mon compte');
  await toolbar(page).getByRole('button', { name: 'Écran global' }).click();
  await expect(page.locator('.sitemap-globals .sitemap-card')).toHaveCount(1);
  await pick(page, 'Fiche produit');
  await toolbar(page).getByRole('button', { name: 'Modales et messages' }).click();
  await page.getByRole('button', { name: 'Ajouter : Erreur' }).click();
  await page.keyboard.type('Produit introuvable');
  await page.keyboard.press('Escape');
  await expect(page.locator('.sitemap-summary')).toContainText('Modales et messages · 1');
  await expect(page.locator('.sitemap-summary')).toContainText('Écrans globaux · 1');

  // The list shows every screen, the message under its screen.
  await toolbar(page).getByRole('button', { name: 'Liste' }).click();
  await expect(page.locator('.sitemap-list tbody tr')).toHaveCount(6);
  await expect(page.locator('.sitemap-extra-row')).toContainText('Produit introuvable');
  await toolbar(page).getByRole('button', { name: 'Arbre' }).click();

  // Folding hides the screens under it, not their count.
  await card(page, 'Catalogue').locator('.sitemap-fold').click();
  await expect(page.locator('.sitemap-tree .sitemap-card')).toHaveCount(2);
  await expect(page.locator('.sitemap-summary')).toContainText('Niveau 3 · 2');

  // Undo takes the message back: its name, then the message.
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.sitemap-summary')).toContainText('Modales et messages · 0');
});

test('moves a screen by its handle, into the global screens', async ({ page }) => {
  await startSitemap(page);
  await buildTree(page);
  const target = card(page, 'Liste');
  await target.hover();
  const grip = (await target.locator('.sitemap-grip').boundingBox())!;
  const zone = (await page.locator('.sitemap-globals-zone').boundingBox())!;
  await page.mouse.move(grip.x + 4, grip.y + 4);
  await page.mouse.down();
  await page.mouse.move(zone.x + zone.width / 2, zone.y + zone.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.sitemap-globals .sitemap-card')).toHaveCount(1);
  await expect(page.locator('.sitemap-globals')).toContainText('Liste');
});

test('links a screen to a step of a map, then filters on it', async ({ page }) => {
  await startProject(page);
  await page.locator('.step').nth(1).getByRole('textbox', { name: 'Nom de l’étape' }).fill('Choisir');
  await addDocument(page, 'Nouvelle arborescence');
  await page.keyboard.type('Accueil');
  await addChild(page, 'Recherche');
  await toolbar(page).getByRole('button', { name: 'Liens' }).click();
  await page.getByRole('combobox', { name: 'Lier à…' }).selectOption({ label: '2 · Choisir' });
  await page.keyboard.press('Escape');
  await expect(card(page, 'Recherche')).toContainText('Map 1');
  await toolbar(page).getByRole('button', { name: 'Filtrer' }).click();
  await page.getByRole('button', { name: 'Reliés à une map' }).click();
  await expect(card(page, 'Recherche')).not.toHaveClass(/is-dimmed/);
  await expect(card(page, 'Accueil')).toHaveClass(/is-dimmed/);
});

test('saves a sitemap and opens it again, unchanged', async ({ page }, info) => {
  await startSitemap(page);
  await buildTree(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  const file = info.outputPath('arbo.mapline');
  await (await download).saveAs(file);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  expect(saved.docs[0].kind).toBe('sitemap');
  expect(saved.docs[0].sitemap.roots[0].name).toBe('Accueil');

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Ouvrir', exact: true }).click();
  await (await chooser).setFiles(file);
  await page.keyboard.press('Escape');
  await expect(page.locator('.sitemap-card')).toHaveCount(5);
  await expect(card(page, 'Fiche produit')).toHaveCount(1);
});

test('exports a sitemap in PDF, a page per branch after the overview, and in PNG', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await startSitemap(page);
  await buildTree(page);
  await pick(page, 'Mon compte');
  await toolbar(page).getByRole('button', { name: 'Écran global' }).click();
  // Shown as a list, still exported as a tree.
  await toolbar(page).getByRole('button', { name: 'Liste' }).click();

  await page.keyboard.press('ControlOrMeta+e');
  await page.locator('input[name=export-format][value=pdf]').check({ force: true });
  await expect(page.getByRole('button', { name: 'Une page par branche' })).toHaveAttribute('aria-pressed', 'true');
  let download = page.waitForEvent('download');
  await page.locator('dialog[open] .btn-primary').click();
  let pdf = (await readFile(await (await download).path())).toString('latin1');
  // Overview, Catalogue (the only branch under Accueil), the global screens.
  const boxes = pdf.match(/\/MediaBox \[[^\]]*\]/g) ?? [];
  expect(boxes).toHaveLength(3);
  for (const box of boxes) expect(box).toMatch(/\/MediaBox \[0 0 842\.?0* 595\.?0*\]/);
  await expect(page.locator('.sitemap-list')).toBeVisible();

  await page.keyboard.press('ControlOrMeta+e');
  await page.getByRole('button', { name: 'Une page', exact: true }).click();
  download = page.waitForEvent('download');
  await page.locator('dialog[open] .btn-primary').click();
  pdf = (await readFile(await (await download).path())).toString('latin1');
  expect(pdf.match(/\/MediaBox \[[^\]]*\]/g) ?? []).toHaveLength(1);

  await page.keyboard.press('ControlOrMeta+e');
  await page.locator('input[name=export-format][value=png]').check({ force: true });
  download = page.waitForEvent('download');
  await page.locator('dialog[open] .btn-primary').click();
  const png = await readFile(await (await download).path());
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(errors).toEqual([]);
});

test('exports a branch too wide for one page over several pages, by its sub-branches', async ({ page }) => {
  await startSitemap(page);
  await page.keyboard.type('Accueil');
  await addChild(page, 'Catalogue');
  await addChild(page, 'Produit 1');
  for (let i = 2; i <= 16; i++) await addSibling(page, `Produit ${i}`);
  await page.keyboard.press('ControlOrMeta+e');
  await page.locator('input[name=export-format][value=pdf]').check({ force: true });
  const download = page.waitForEvent('download');
  await page.locator('dialog[open] .btn-primary').click();
  const pdf = (await readFile(await (await download).path())).toString('latin1');
  // The overview, then the sixteen screens of Catalogue on two even pages.
  expect(pdf.match(/\/MediaBox \[[^\]]*\]/g) ?? []).toHaveLength(3);
});
