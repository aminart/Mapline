// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { arrowsOverCards, startProject, openProjects } from './helpers';

const CARDS = '.flow [data-node]';

/** Opens the app on a new flow project made from a flow template. */
async function startFlow(page: Page, template: 'Flow utilisateur' | 'Flow vide') {
  await page.goto('/');
  await page.locator('.start').getByRole('button', { name: 'Flow', exact: true }).click();
  await page.locator('.start .tpl-card').filter({ hasText: template }).click();
  await expect(page.locator('.flow')).toBeVisible();
}

const cards = (page: Page) => page.locator(CARDS);
const texts = (page: Page) => page.getByRole('textbox', { name: 'Texte de la carte' });
const arrows = (page: Page) => page.locator('.flow svg.links .link-line');

/** The card whose text is `text`. */
async function card(page: Page, text: string): Promise<Locator> {
  const all = cards(page);
  for (let i = 0; i < (await all.count()); i++) {
    if ((await all.nth(i).locator('textarea, input').first().inputValue()) === text) return all.nth(i);
  }
  throw new Error(`no card "${text}"`);
}

const left = async (l: Locator) => parseFloat((await l.getAttribute('style'))!.match(/left: ([\d.]+)px/)![1]);
const top = async (l: Locator) => parseFloat((await l.getAttribute('style'))!.match(/top: ([\d.]+)px/)![1]);

test('creates a flow from its template, arrows clear of every card', async ({ page }) => {
  await startFlow(page, 'Flow utilisateur');
  await expect(cards(page)).toHaveCount(7);
  await expect(arrows(page)).toHaveCount(7);
  await expect(page.locator('.flow .link-label')).toHaveText(['Oui', 'Non']);
  expect(await arrowsOverCards(page, CARDS)).toEqual([]);
});

test('adds cards on all four sides, moving the rest of the flow along', async ({ page }) => {
  await startFlow(page, 'Flow vide');
  const start = await card(page, 'Début');
  const end = await card(page, 'Fin');
  const endLeft = await left(end);
  await start.locator('input').click();
  // Right of the start is taken by the end: it moves one column right.
  await start.getByRole('button', { name: 'Ajouter une carte à droite' }).click();
  await page.keyboard.type('Ouvre l’app');
  await expect(cards(page)).toHaveCount(3);
  expect(await left(end)).toBeGreaterThan(endLeft);
  const app = await card(page, 'Ouvre l’app');
  const appTop = await top(app);
  await app.getByRole('button', { name: 'Ajouter une carte au-dessus' }).click();
  await page.keyboard.type('En haut');
  // Above the first row: a row is inserted, the rest moves down.
  expect(await top(app)).toBeGreaterThan(appTop);
  expect(await top(await card(page, 'En haut'))).toBeLessThan(await top(app));
  await app.locator('textarea').click();
  await app.getByRole('button', { name: 'Ajouter une carte en dessous' }).click();
  await page.keyboard.type('En bas');
  await app.locator('textarea').click();
  await app.getByRole('button', { name: 'Ajouter une carte à gauche' }).click();
  await page.keyboard.type('À gauche');
  await expect(cards(page)).toHaveCount(6);
  await expect(arrows(page)).toHaveCount(5);
  expect(await arrowsOverCards(page, CARDS)).toEqual([]);
});

test('drags a card to an empty cell, the card following the pointer', async ({ page }) => {
  await startFlow(page, 'Flow utilisateur');
  const activity = cards(page).nth(1);
  await activity.hover();
  const grip = (await activity.locator('.flow-grip').boundingBox())!;
  const target = page.locator('.flow-drop[style*="left: 292px"][style*="top: 48px"]');
  const drop = (await target.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  const x = drop.x + drop.width / 2;
  const y = drop.y + drop.height / 2;
  await page.mouse.move(x, y, { steps: 8 });
  // The dragged copy sits under the pointer, as the card did when picked up.
  const ghost = (await page.locator('.drag-ghost').boundingBox())!;
  expect(x).toBeGreaterThan(ghost.x);
  expect(x).toBeLessThan(ghost.x + ghost.width);
  expect(y).toBeGreaterThan(ghost.y);
  expect(y).toBeLessThan(ghost.y + ghost.height);
  await page.mouse.up();
  await expect(page.locator('.drag-ghost')).toHaveCount(0);
  expect(await top(cards(page).nth(1))).toBe(48);
  expect(await arrowsOverCards(page, CARDS)).toEqual([]);
});

test('links back with the Connect tool, the loop going round the cards', async ({ page }) => {
  await startFlow(page, 'Flow utilisateur');
  await texts(page).nth(1).fill('Saisit son e-mail');
  await texts(page).nth(5).fill('Accède à son espace');
  await page.getByRole('button', { name: 'Relier', exact: true }).click();
  await (await card(page, 'Accède à son espace')).locator('.link-target').click();
  await (await card(page, 'Saisit son e-mail')).locator('.link-target').click();
  await page.getByRole('button', { name: 'Sélection', exact: true }).click();
  await expect(arrows(page)).toHaveCount(8);
  expect(await arrowsOverCards(page, CARDS)).toEqual([]);
});

test('inserts on an arrow, then deletes the card and keeps the run joined', async ({ page }) => {
  await startFlow(page, 'Flow vide');
  await page.locator('.flow').hover();
  await page.getByRole('button', { name: /Insérer une carte ici/ }).click();
  await page.locator('.flow-insert-menu').getByRole('button', { name: 'Choix' }).click();
  await page.keyboard.type('Connecté ?');
  await expect(cards(page)).toHaveCount(3);
  await expect(arrows(page)).toHaveCount(2);
  const choice = await card(page, 'Connecté ?');
  await choice.hover();
  await choice.getByRole('button', { name: 'Supprimer la carte' }).click();
  await expect(cards(page)).toHaveCount(2);
  await expect(arrows(page)).toHaveCount(1);
});

test('selects an arrow, labels it and deletes it with the Delete key', async ({ page }) => {
  await startFlow(page, 'Flow vide');
  await page.locator('.flow .link-hit').first().dispatchEvent('click');
  await page.getByRole('toolbar').getByPlaceholder(/Texte sur la flèche/).fill('Valide');
  await expect(page.locator('.flow .link-label')).toHaveText(['Valide']);
  await page.locator('.flow .link-label').click();
  await page.keyboard.press('Delete');
  await expect(arrows(page)).toHaveCount(0);
});

test('a flow inside a map project, saved and opened again', async ({ page }, info) => {
  await startProject(page);
  await page.getByRole('button', { name: 'Nouveau flow' }).click();
  await page.locator('dialog[open] .tpl-card').filter({ hasText: 'Flow vide' }).click();
  await expect(page.locator('.flow')).toBeVisible();
  await page.getByRole('toolbar').getByRole('textbox', { name: 'Nom du flow' }).fill('Connexion');
  await expect(page.locator('.doc-tab')).toHaveText(['Map', 'Flow · Connexion']);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  const file = info.outputPath('avec-flow.mapline');
  await (await download).saveAs(file);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  expect(saved.docs.map((d: { kind: string }) => d.kind)).toEqual(['mission-map', 'flow']);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Ouvrir', exact: true }).click();
  await (await chooser).setFiles(file);
  await expect(await openProjects(page)).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('.doc-tab')).toHaveText(['Map', 'Flow · Connexion']);
});

test('exports a flow as PNG and PDF', async ({ page }) => {
  await startFlow(page, 'Flow utilisateur');
  for (const [format, magic] of [
    ['png', 'PNG'],
    ['pdf', '%PDF'],
  ] as const) {
    await page.keyboard.press('ControlOrMeta+e');
    await expect(page.locator('input[name=export-format][value=csv]')).toHaveCount(0);
    await page.locator(`input[name=export-format][value=${format}]`).check({ force: true });
    const download = page.waitForEvent('download');
    await page.locator('dialog[open] .btn-primary').click();
    const bytes = await readFile(await (await download).path());
    expect(bytes.subarray(format === 'png' ? 1 : 0, 4).toString()).toBe(magic);
  }
});

test('a card grows with its text: its row follows, arrows stay clear of every card', async ({ page }) => {
  await startFlow(page, 'Flow utilisateur');
  const activity = cards(page).nth(1);
  const choice = cards(page).nth(2);
  await texts(page).nth(1).fill('Une activité avec beaucoup de texte, pour voir la carte grandir quand on écrit plusieurs lignes de description.');
  await expect.poll(async () => (await activity.boundingBox())!.height).toBeGreaterThan(130);
  const a = (await activity.boundingBox())!;
  const c = (await choice.boundingBox())!;
  // Centred in the same row: the arrow between them stays straight.
  expect(Math.abs(a.y + a.height / 2 - (c.y + c.height / 2))).toBeLessThan(1.5);
  expect(c.height).toBeLessThan(a.height);
  expect(await arrowsOverCards(page, CARDS)).toEqual([]);
});

test('adds tags and a note on a flow card, as on map activities', async ({ page }) => {
  await startFlow(page, 'Flow utilisateur');
  const card = cards(page).nth(1);
  await card.hover();
  await card.getByRole('button', { name: 'Ajouter un tag' }).click();
  await page.keyboard.type('irritant');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(card.locator('.tag')).toHaveText(['irritant']);
  await card.hover();
  await card.getByRole('button', { name: 'Ajouter une note' }).click();
  await page.getByRole('dialog', { name: 'Note' }).locator('textarea').fill('À valider avec le support');
  await page.mouse.click(5, 300);
  await expect(card.locator('.note')).toHaveClass(/has-note/);
  await page.locator('.toolbar summary').filter({ hasText: 'Tags' }).click();
  await expect(page.locator('.tag-list li')).toHaveCount(1);
});
