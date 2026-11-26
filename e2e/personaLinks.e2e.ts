// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { addDocument, startProject } from './helpers';

const clinic = fileURLToPath(new URL('./fixtures/liens-personas.mapline', import.meta.url));

/** Opens the Clinique du Parc: two maps, a flow, three sheets and a persona links page, shown. */
async function openClinic(page: Page) {
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Ouvrir un projet…' }).click();
  await (await chooser).setFiles(clinic);
  await page.getByRole('tab', { name: 'Liens personas' }).click();
  await expect(page.locator('.plinks-node')).toHaveCount(8);
}

const toolbar = (page: Page) => page.locator('.toolbar').first();
const node = (page: Page, name: string) => page.locator('.plinks-node').filter({ hasText: name });

test('shows the personas and their links; links two personas; the sheet lists the link', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openClinic(page);
  await expect(page.locator('.plinks-summary')).toContainText('8 personas · 14 liens');
  expect((await toolbar(page).boundingBox())!.height).toBe(48);
  await expect(page.locator('.plinks-zone')).toHaveCount(3);

  // A persona chosen: its links in the bubble, its journeys in the maps and flows.
  await node(page, 'Paul Garnier').click();
  const pop = page.locator('.plinks-pop');
  await expect(pop).toContainText('Ses liens (5)');
  await expect(pop).toContainText('Influence ← Léa Garnier');
  await expect(pop).toContainText('Parcours de soin');
  await expect(pop).toContainText('Flow · Prise de RDV en ligne');
  await expect(node(page, 'Nadia Benali')).toHaveClass(/is-faded/);

  // Link Nadia to Léa: "Collabore avec", no arrow; then label it, make it one way and strong.
  await page.keyboard.press('Escape');
  await toolbar(page).getByRole('button', { name: 'Relier deux personas' }).click();
  await node(page, 'Nadia Benali').click();
  await expect(toolbar(page)).toContainText('Cliquez le persona à relier à Nadia Benali');
  await node(page, 'Léa Garnier').click();
  await expect(page.locator('.plinks-summary')).toContainText('15 liens');
  await expect(toolbar(page).getByRole('button', { name: 'Type du lien' })).toContainText('Collabore avec');
  await toolbar(page).getByRole('textbox', { name: 'Libellé du lien' }).fill('Prépare les piluliers');
  await toolbar(page).getByRole('button', { name: 'Dans un sens' }).click();
  await toolbar(page).getByRole('button', { name: 'Force 3 sur 3' }).click();
  const line = page.locator('.plinks-links .link-line').last();
  await expect(line).toHaveAttribute('data-head', 'end');
  await expect(line).toHaveAttribute('data-width', '3.25');
  await expect(page.locator('.plinks-label', { hasText: 'Prépare les piluliers' })).toBeVisible();

  // The sheet of Léa lists it; a click comes back to it.
  await page.getByRole('tab', { name: 'Fiche · Léa Garnier' }).click();
  const row = page.locator('.sheet-relations .sheet-flow', { hasText: 'Nadia Benali' });
  await expect(row).toContainText('Collabore avec ← Nadia Benali · Prépare les piluliers');
  await row.click();
  await expect(page.locator('.plinks-label.is-selected')).toHaveText('Prépare les piluliers');

  // Delete removes it, Ctrl+Z brings it back.
  await page.locator('.canvas').click({ position: { x: 5, y: 5 } });
  await page.locator('.plinks-label', { hasText: 'Prépare les piluliers' }).click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.plinks-summary')).toContainText('14 liens');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.plinks-summary')).toContainText('15 liens');
  expect(errors).toEqual([]);
});

test('moves a persona, then shows the circles around the one chosen', async ({ page }) => {
  await openClinic(page);
  const nadia = node(page, 'Nadia Benali');
  const before = (await nadia.boundingBox())!;
  await page.mouse.move(before.x + 60, before.y + 20);
  await page.mouse.down();
  await page.mouse.move(before.x + 20, before.y + 80, { steps: 6 });
  await page.mouse.up();
  const after = (await nadia.boundingBox())!;
  expect(Math.round(after.y - before.y)).toBe(60);
  // A drag doesn't choose the persona.
  await expect(nadia).not.toHaveClass(/is-selected/);

  await node(page, 'Léa Garnier').click();
  await toolbar(page).getByRole('button', { name: 'Cercles' }).click();
  await expect(page.locator('.plinks-summary')).toContainText('Centré sur Léa Garnier');
  await expect(node(page, 'Léa Garnier')).toHaveClass(/is-center/);
  await expect(page.locator('.plinks-rings ellipse')).toHaveCount(2);
  await expect(page.locator('.plinks-zone')).toHaveCount(0);
  // Another persona clicked: the circles centre on it.
  await node(page, 'Marc Dubois').click();
  await expect(page.locator('.plinks-summary')).toContainText('Centré sur Marc Dubois');
  // Back to the network, everyone where they were put.
  await toolbar(page).getByRole('button', { name: 'Réseau' }).click();
  expect(Math.round((await nadia.boundingBox())!.y)).toBe(Math.round(after.y));
});

test('suggests links from the maps, adds personas, and makes a new one with its sheet', async ({ page }) => {
  await openClinic(page);
  await expect(page.locator('.plinks-suggestion')).toHaveCount(0);
  await toolbar(page).getByRole('button', { name: 'Filtrer' }).click();
  await page.getByText('Croisements des maps').click();
  await page.keyboard.press('Escape');
  // Claire and Léa both are in the Consultation and Annonce steps.
  const suggestions = page.locator('.plinks-suggestion');
  await expect(suggestions.first()).toBeVisible();
  const count = await suggestions.count();
  await page.locator('.plinks-suggestion[title*="Consultation, Annonce"]').first().click();
  await expect(suggestions).toHaveCount(count - 1);
  await expect(page.locator('.plinks-summary')).toContainText('15 liens');

  // Hiding a kind of link takes it off the page.
  await page.locator('.plinks-legend-item', { hasText: 'Tension' }).click();
  await expect(page.locator('.plinks-summary')).toContainText('15 liens');
  await expect(page.locator('.plinks-links .link-line')).toHaveCount(13);

  await page.keyboard.press('Escape');
  await toolbar(page).getByRole('button', { name: 'Ajouter un persona' }).click();
  await page.locator('.tool-menu-panel').getByRole('button', { name: /Julie Roche/ }).click();
  await expect(page.locator('.plinks-node')).toHaveCount(9);
  await toolbar(page).getByRole('button', { name: 'Ajouter un persona' }).click();
  await page.getByRole('textbox', { name: 'Nom du nouveau persona' }).fill('Zoé Martin');
  await page.keyboard.press('Enter');
  await expect(page.locator('.plinks-node')).toHaveCount(10);
  await expect(node(page, 'Zoé Martin')).toHaveClass(/is-selected/);
  await expect(page.getByRole('tab', { name: 'Fiche · Zoé Martin' })).toBeVisible();

  // Kinds of link: renamed, and a new one.
  await toolbar(page).getByRole('button', { name: 'Type des nouveaux liens' }).click();
  await page.locator('.plinks-types').getByRole('textbox', { name: 'Nom du type' }).nth(4).fill('Frictions');
  await page.locator('.plinks-types').getByRole('button', { name: 'Ajouter un type' }).click();
  await expect(page.locator('.plinks-type-row')).toHaveCount(6);
  await page.keyboard.press('Escape');
  await expect(page.locator('.plinks-legend')).toContainText('Frictions');
  await expect(toolbar(page).getByRole('button', { name: 'Type des nouveaux liens' })).toContainText('Nouveau type');
});

test('starts a page with every persona of the project', async ({ page }) => {
  await startProject(page);
  await addDocument(page, 'Nouveaux liens personas');
  await expect(page.getByRole('tab', { name: 'Liens personas' })).toHaveAttribute('aria-selected', 'true');
  // The map template's personas, none linked yet.
  expect(await page.locator('.plinks-node').count()).toBeGreaterThan(0);
  await expect(page.locator('.plinks-summary')).toContainText('0 lien');
});

test('exports persona links in PNG, PDF and PowerPoint', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await openClinic(page);
  await node(page, 'Paul Garnier').click();

  await page.keyboard.press('ControlOrMeta+e');
  await page.locator('input[name=export-format][value=png]').check({ force: true });
  let download = page.waitForEvent('download');
  await page.locator('dialog[open] .btn-primary').click();
  const png = await readFile(await (await download).path());
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  // The selection is back once exported.
  await expect(node(page, 'Paul Garnier')).toHaveClass(/is-selected/);

  await page.keyboard.press('ControlOrMeta+e');
  await page.locator('input[name=export-format][value=pdf]').check({ force: true });
  download = page.waitForEvent('download');
  await page.locator('dialog[open] .btn-primary').click();
  const pdf = (await readFile(await (await download).path())).toString('latin1');
  expect(pdf.match(/\/MediaBox \[[^\]]*\]/g) ?? []).toHaveLength(1);

  await page.keyboard.press('ControlOrMeta+e');
  await page.locator('input[name=export-format][value=pptx]').check({ force: true });
  download = page.waitForEvent('download');
  await page.locator('dialog[open] .btn-primary').click();
  const pptx = await readFile(await (await download).path());
  expect(pptx.subarray(0, 2).toString()).toBe('PK');
  expect(errors).toEqual([]);
});
