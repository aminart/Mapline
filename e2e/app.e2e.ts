// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { addActivity, arrowsOverCards, cell, clippedFields, fillWithLongText, link, personaRows, startProject, openProjects } from './helpers';

const legacyFile = fileURLToPath(new URL('./fixtures/projet-v0.9.missionmap', import.meta.url));

test('creates a project and inserts a step in the middle', async ({ page }) => {
  await startProject(page);
  const steps = page.locator('.step[data-step]');
  await expect(steps).toHaveCount(5);
  await page.locator('.step').nth(1).getByRole('textbox', { name: 'Nom de l’étape' }).fill('Avant');
  await page.locator('.step').nth(2).getByRole('textbox', { name: 'Nom de l’étape' }).fill('Après');
  // The insert button sits before each step but the first.
  await page.locator('.step').nth(2).getByRole('button', { name: 'Insérer une étape ici' }).click();
  await expect(steps).toHaveCount(6);
  const names = page.locator('.step').getByRole('textbox', { name: 'Nom de l’étape' });
  await expect(names.nth(1)).toHaveValue('Avant');
  await expect(names.nth(2)).toHaveValue('');
  await expect(names.nth(3)).toHaveValue('Après');
});

test('inserts a phase between two phases', async ({ page }) => {
  await startProject(page);
  const phases = page.locator('.phase');
  const names = phases.getByRole('textbox', { name: 'Nom de la phase' });
  const before = await phases.count();
  expect(before).toBeGreaterThan(1);
  const steps = await page.locator('.step[data-step]').count();
  await names.nth(0).fill('Avant');
  await names.nth(1).fill('Après');
  await phases.nth(1).getByRole('button', { name: 'Insérer une phase ici' }).click();
  await expect(phases).toHaveCount(before + 1);
  await expect(page.locator('.step[data-step]')).toHaveCount(steps + 1);
  await expect(names.nth(0)).toHaveValue('Avant');
  await expect(names.nth(1)).toHaveValue('');
  await expect(names.nth(1)).toBeFocused();
  await expect(names.nth(2)).toHaveValue('Après');
});

test('a card grows with its text and never spills over the next row', async ({ page }) => {
  await startProject(page);
  await addActivity(page, 0, 1, 'Une activité au texte long, qui doit agrandir la carte et toute la ligne du persona pour rester lisible à l’export. '.repeat(3));
  await addActivity(page, 1, 1, 'Une carte courte');
  const rows = await personaRows(page);
  expect(rows[0].row.bottom - rows[0].row.top).toBeGreaterThan(150);
  for (const [i, { row, cards }] of rows.entries()) {
    for (const card of cards) {
      expect(card.top).toBeGreaterThanOrEqual(row.top - 1);
      expect(card.bottom).toBeLessThanOrEqual(row.bottom + 1);
    }
    const next = rows[i + 1];
    // Rows keep their gap (a separator row may sit in it).
    if (next) expect(next.row.top - row.bottom).toBeGreaterThanOrEqual(20);
  }
});

test('two alternatives share a cell, with an editable word between them', async ({ page }) => {
  await startProject(page);
  await addActivity(page, 0, 0, 'Réserve en ligne');
  await cell(page, 0, 0).locator('.card').hover();
  await cell(page, 0, 0).getByRole('button', { name: /Ajouter une alternative/ }).click();
  await page.keyboard.type('Appelle le cabinet');
  await expect(cell(page, 0, 0).locator('.card')).toHaveCount(2);
  const word = cell(page, 0, 0).getByRole('textbox', { name: /Mot entre les deux alternatives/ });
  await expect(word).toHaveValue('ou');
  await word.fill('sinon');
  await expect(word).toHaveValue('sinon');
  // Both cards stay inside the row.
  const [first] = await personaRows(page);
  for (const card of first.cards) expect(card.bottom).toBeLessThanOrEqual(first.row.bottom + 1);
});

test('arrows go round cards, split cells included', async ({ page }) => {
  await startProject(page);
  await addActivity(page, 0, 0, 'Départ');
  await addActivity(page, 0, 1, 'Obstacle haut');
  await addActivity(page, 1, 1, 'Choix A');
  await cell(page, 1, 1).locator('.card').hover();
  await cell(page, 1, 1).getByRole('button', { name: /Ajouter une alternative/ }).click();
  await page.keyboard.type('Choix B');
  await addActivity(page, 1, 2, 'Obstacle milieu');
  await addActivity(page, 2, 3, 'Arrivée');
  await addActivity(page, 0, 3, 'Fin du haut');

  const cards = (row: number, col: number) => cell(page, row, col).locator('.card');
  await link(page, cards(0, 0), cards(2, 3)); // across rows and columns
  await link(page, cards(1, 1).first(), cards(0, 3)); // from the top half of a split cell
  await link(page, cards(1, 1).last(), cards(2, 3)); // from the bottom half
  await link(page, cards(0, 0), cards(1, 1).last()); // into the bottom half
  await expect(page.locator('svg.links .link-line')).toHaveCount(4);
  expect(await arrowsOverCards(page)).toEqual([]);
});

test('chooses the sides a map arrow leaves and enters by, then back to automatic', async ({ page }) => {
  await startProject(page);
  await addActivity(page, 1, 0, 'Départ');
  await addActivity(page, 1, 1, 'Arrivée');
  const cards = (row: number, col: number) => cell(page, row, col).locator('.card');
  await link(page, cards(1, 0), cards(1, 1));
  const line = page.locator('svg.links .link-line').first();
  const straight = await line.getAttribute('d');
  await page.locator('svg.links .link-hit').first().dispatchEvent('click');
  const toolbar = page.getByRole('toolbar');
  await toolbar.getByRole('button', { name: 'Côtés' }).click();
  await toolbar.getByRole('group', { name: 'Départ' }).getByRole('button', { name: 'Bas' }).click();
  await toolbar.getByRole('group', { name: 'Arrivée' }).getByRole('button', { name: 'Bas' }).click();
  await expect(toolbar.getByRole('group', { name: 'Départ' }).getByRole('button', { name: 'Bas' })).toHaveAttribute('aria-pressed', 'true');
  // Out of the bottom of the first card, under the row, up into the bottom of the second.
  await expect(line).not.toHaveAttribute('d', straight!);
  const [start, end] = await Promise.all([cards(1, 0).boundingBox(), cards(1, 1).boundingBox()]);
  const box = await line.boundingBox();
  expect(box!.y + box!.height).toBeGreaterThan(Math.max(start!.y + start!.height, end!.y + end!.height) + 5);
  expect(await arrowsOverCards(page)).toEqual([]);
  await toolbar.getByRole('group', { name: 'Départ' }).getByRole('button', { name: 'Auto' }).click();
  await toolbar.getByRole('group', { name: 'Arrivée' }).getByRole('button', { name: 'Auto' }).click();
  await expect(line).toHaveAttribute('d', straight!);
});

test('a hovered card brings its arrows forward and fades the others', async ({ page }) => {
  await startProject(page);
  await addActivity(page, 0, 0, 'A');
  await addActivity(page, 0, 1, 'B');
  await addActivity(page, 1, 2, 'C');
  await addActivity(page, 1, 3, 'D');
  const card = (row: number, col: number) => cell(page, row, col).locator('.card');
  await link(page, card(0, 0), card(0, 1));
  await link(page, card(1, 2), card(1, 3));
  const groups = page.locator('svg.links g');
  await expect(groups).toHaveCount(2);
  // Nothing hovered or selected: every arrow drawn alike.
  await page.locator('main.canvas').click({ position: { x: 4, y: 4 } });
  await page.mouse.move(0, 0);
  await expect(page.locator('svg.links g.is-faded')).toHaveCount(0);

  await card(1, 2).hover();
  await expect(groups.nth(0)).toHaveClass(/is-faded/);
  await expect(groups.nth(1)).toHaveClass(/is-focus/);
  await expect(card(1, 3)).toHaveClass(/is-link-end/);
  await expect(card(0, 1)).not.toHaveClass(/is-link-end/);

  // A selected card keeps its arrows forward once the pointer has left it.
  await card(0, 0).locator('textarea').click();
  await page.mouse.move(0, 0);
  await expect(groups.nth(0)).toHaveClass(/is-focus/);
  await expect(groups.nth(1)).toHaveClass(/is-faded/);
});

test('undo and redo', async ({ page }) => {
  await startProject(page);
  const objective = page.getByPlaceholder('Quel est l’objectif de ce parcours ?');
  await objective.fill('Réserver en 3 minutes');
  await page.locator('.persona-row').first().getByRole('button', { name: 'Supprimer ce persona' }).click();
  await expect(page.locator('.persona-row')).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.persona-row')).toHaveCount(3);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(page.locator('.persona-row')).toHaveCount(2);
  await expect(objective).toHaveValue('Réserver en 3 minutes');
});

test('saves a project and opens it again, unchanged', async ({ page }, info) => {
  await startProject(page);
  await page.getByRole('textbox', { name: 'Nom du projet' }).fill('Projet test');
  await page.getByPlaceholder('Quel est l’objectif de ce parcours ?').fill('Un objectif enregistré');
  await addActivity(page, 0, 0, 'Une activité enregistrée');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  const file = info.outputPath('projet-test.mapline');
  expect((await download).suggestedFilename()).toBe('Projet test.mapline');
  await (await download).saveAs(file);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  expect(saved.version).toBe(2);
  expect(saved.title).toBe('Projet test');
  expect(saved.docs).toHaveLength(1);
  await expect(page.locator('.save-btn')).toContainText('Enregistré');

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Ouvrir', exact: true }).click();
  await (await chooser).setFiles(file);
  await expect(await openProjects(page)).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox', { name: 'Nom du projet' })).toHaveValue('Projet test');
  await expect(page.getByPlaceholder('Quel est l’objectif de ce parcours ?')).toHaveValue('Un objectif enregistré');
  await expect(cell(page, 0, 0).getByRole('textbox', { name: 'Activité' })).toHaveValue('Une activité enregistrée');
});

test('opens a file saved before version 0.10', async ({ page }) => {
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Ouvrir un projet…' }).click();
  await (await chooser).setFiles(legacyFile);
  await expect(page.getByRole('textbox', { name: 'Nom du projet' })).toHaveValue('Projet 0.9');
  await expect(page.getByPlaceholder('Quel est l’objectif de ce parcours ?')).toHaveValue('Objectif d’un ancien projet');
  await expect(page.locator('.step').getByRole('textbox', { name: 'Nom de l’étape' }).first()).toHaveValue('Étape héritée');
  await expect(cell(page, 0, 0).getByRole('textbox', { name: 'Activité' })).toHaveValue('Activité héritée');
  await expect(cell(page, 0, 0).locator('.tag')).toContainText('irritant');
});

test('exports PNG and PDF files', async ({ page }) => {
  await startProject(page);
  await addActivity(page, 0, 0, 'À exporter');
  for (const [format, check] of [
    ['png', (b: Buffer) => b.subarray(1, 4).toString() === 'PNG'],
    ['pdf', (b: Buffer) => b.subarray(0, 4).toString() === '%PDF'],
  ] as const) {
    await page.keyboard.press('ControlOrMeta+e');
    await page.locator(`input[name=export-format][value=${format}]`).check({ force: true });
    const download = page.waitForEvent('download');
    await page.locator('dialog[open] .btn-primary').click();
    const path = await (await download).path();
    const bytes = await readFile(path);
    expect(check(bytes), `${format} file`).toBe(true);
    expect(bytes.length).toBeGreaterThan(5_000);
  }
});

test('presents step by step', async ({ page }) => {
  await startProject(page);
  await page.keyboard.press('F5');
  await expect(page.locator('.present-bar')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.present-bar')).toContainText('Étape 1');
  await page.keyboard.press('Escape');
  await expect(page.locator('.present-bar')).toHaveCount(0);
});

test('switches to English', async ({ page }) => {
  await startProject(page);
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible();
});

test('asks before closing a tab with unsaved changes', async ({ page }) => {
  await startProject(page);
  await addActivity(page, 0, 0, 'Pas encore enregistrée');
  page.once('dialog', (dialog) => dialog.dismiss());
  await (await openProjects(page)).getByRole('button', { name: /Fermer/ }).click();
  await expect(page.locator('.project-item')).toHaveCount(1);
});

test('shows the project in the main bar, its documents as tabs, and adds a second map', async ({ page }) => {
  await startProject(page);
  await expect(page.locator('.topbar').getByRole('textbox', { name: 'Nom du projet' })).toHaveValue('Nouvelle map');
  await page.locator('.docbar').getByRole('button', { name: 'Nouvelle map' }).click();
  await page.locator('dialog[open] .tpl-card').filter({ hasText: 'Map vide' }).click();
  await expect(page.locator('.doc-tab')).toHaveText(['Map', 'Map 2']);
  await expect(page.locator('.persona-row')).toHaveCount(1);
});

test('adds a choice card in a map and turns it into an activity', async ({ page }) => {
  await startProject(page);
  await cell(page, 0, 1).hover();
  await cell(page, 0, 1).getByRole('button', { name: 'Ajouter une carte choix ici' }).click();
  await page.keyboard.type('Compte existant ?');
  const card = cell(page, 0, 1).locator('.card');
  await expect(card).toHaveClass(/card-choice/);
  await expect(card.locator('.choice-tag')).toHaveText('Choix');
  await page.getByRole('toolbar').getByRole('button', { name: 'Type' }).click();
  const kind = page.getByRole('group', { name: 'Type' });
  await expect(kind.getByRole('button', { name: 'Choix' })).toHaveAttribute('aria-pressed', 'true');
  await kind.getByRole('button', { name: 'Activité' }).click();
  await expect(card).not.toHaveClass(/card-choice/);
  await expect(card.getByRole('textbox', { name: 'Activité' })).toHaveValue('Compte existant ?');
});

test('presents every document of the project in turn', async ({ page }) => {
  await startProject(page);
  await page.locator('.docbar').getByRole('button', { name: 'Nouveau flow' }).click();
  await page.locator('dialog[open] .tpl-card').filter({ hasText: 'Flow vide' }).click();
  await page.locator('.doc-tab').filter({ hasText: 'Map' }).locator('.doc-tab-btn').click();
  await page.getByRole('button', { name: 'Présenter', exact: true }).click();
  const kicker = page.locator('.present-kicker');
  await expect(kicker).toHaveText('Map · 1/2 · Vue d’ensemble');
  // The map's five steps, then the flow.
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await expect(kicker).toHaveText('Flow · 2/2 · Vue d’ensemble');
  await expect(page.locator('.flow')).toBeVisible();
  await expect(page.locator('.flow .flow-handle')).toHaveCount(0);
  await page.keyboard.press('ArrowLeft');
  await expect(kicker).toHaveText('Map · Étape 5 / 5 · Après');
  await page.keyboard.press('Escape');
  await expect(page.locator('.present-bar')).toHaveCount(0);
});

test('presents a flow column by column, zoomed in', async ({ page }) => {
  await page.goto('/');
  await page.locator('.start').getByRole('button', { name: 'Flow', exact: true }).click();
  await page.locator('.start .tpl-card').filter({ hasText: 'Flow utilisateur' }).click();
  await page.locator('.flow [data-node].flow-activity').first().locator('textarea').fill('Ouvre l’app');
  await page.getByRole('button', { name: 'Présenter', exact: true }).click();
  const kicker = page.locator('.present-kicker');
  await expect(kicker).toHaveText('Flow · Vue d’ensemble');
  const cols = await page.locator('.flow [data-node]').evaluateAll((els) => [...new Set(els.map((e) => Number(e.getAttribute('data-reveal'))))].length);
  // The start, then the first activity, larger than life; the end isn't shown yet.
  await page.keyboard.press('ArrowRight');
  await expect(kicker).toHaveText(`Étape 1 / ${cols}`);
  await page.keyboard.press('ArrowRight');
  await expect(kicker).toHaveText(`Étape 2 / ${cols}`);
  await expect(page.locator('.present-name')).toHaveText('Ouvre l’app');
  await expect.poll(() => page.evaluate(() => Number(getComputedStyle(document.querySelector('.board-zoom')!).zoom))).toBeGreaterThan(1);
  await expect(page.locator('.flow [data-node].flow-end')).toBeHidden();
  await expect(page.locator('.flow [data-node].flow-start')).toBeVisible();
  if (process.env.STATE_SHOTS) await page.screenshot({ path: `${process.env.STATE_SHOTS}/flow-present.png` });
  // To the last column: everything is shown.
  for (let i = 2; i < cols; i++) await page.keyboard.press('ArrowRight');
  await expect(kicker).toHaveText(`Étape ${cols} / ${cols}`);
  await expect(page.locator('.flow [data-node].flow-end')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Suivant' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('.present-bar')).toHaveCount(0);
  await expect(page.locator('.flow [data-node].flow-end')).toBeVisible();
});

/** The alpha of a few pixels of a downloaded PNG: a corner, and the middle. */
async function pngAlpha(page: Page, path: string): Promise<{ corner: number; middle: number }> {
  const b64 = (await readFile(path)).toString('base64');
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return { corner: ctx.getImageData(1, 1, 1, 1).data[3], middle: ctx.getImageData(img.width >> 1, img.height >> 1, 1, 1).data[3] };
  }, b64);
}

test('exports a PNG with nothing behind its rounded corners, and a PDF on A4 by default', async ({ page }) => {
  await startProject(page);
  await page.keyboard.press('ControlOrMeta+e');
  await page.locator('input[name=export-format][value=png]').check({ force: true });
  let download = page.waitForEvent('download');
  await page.locator('dialog[open] .btn-primary').click();
  const alpha = await pngAlpha(page, await (await download).path());
  expect(alpha).toEqual({ corner: 0, middle: 255 });
  await expect(page.locator('.busy')).toHaveCount(0);

  await page.keyboard.press('ControlOrMeta+e');
  await page.locator('input[name=export-format][value=pdf]').check({ force: true });
  await expect(page.getByRole('button', { name: 'Pages A4' })).toHaveAttribute('aria-pressed', 'true');
  download = page.waitForEvent('download');
  await page.locator('dialog[open] .btn-primary').click();
  const pdf = (await readFile(await (await download).path())).toString('latin1');
  expect(pdf).toMatch(/\/MediaBox \[0 0 842\.?0* 595\.?0*\]/);
});

test('shows every text of the map in full: phases, steps, personas and rows grow with it', async ({ page }) => {
  await startProject(page);
  const tools = page.getByRole('toolbar', { name: 'Outils et mise en forme' });
  await tools.getByRole('button', { name: 'Storyboard' }).click();
  await page.getByRole('button', { name: 'Ligne de texte libre' }).click();
  await page.getByRole('button', { name: 'Ligne de texte libre' }).click();
  await addActivity(page, 0, 0, 'Une activité');
  await fillWithLongText(page, '.board');
  expect(await clippedFields(page, '.board')).toEqual([]);
  // A name or title stays on one line of text: Enter adds no line break.
  const step = page.locator('.step').first().getByRole('textbox', { name: 'Nom de l’étape' });
  await step.press('End');
  await step.press('Enter');
  await expect(step).not.toHaveValue(/\n/);
});

/** The persona rows and separator lines of the map, top to bottom: persona names, or '—' for a line. */
async function rowOrder(page: Page): Promise<string[]> {
  return page.locator('.persona-grid').locator('.persona-row, .divider-row').evaluateAll((els) =>
    els.map((el) => (el.classList.contains('divider-row') ? '—' : (el.querySelector<HTMLTextAreaElement>('textarea[aria-label="Nom du persona"]')?.value ?? '?'))),
  );
}

/** Drags from the centre of `from` to a point of `to` (its centre by default). */
async function dragTo(page: Page, from: Locator, to: Locator, dy = 0) {
  await from.scrollIntoViewIfNeeded();
  await from.hover({ force: true });
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + dy, { steps: 8 });
  await page.mouse.up();
}

test('swaps personas without moving the separator lines, and moves a line', async ({ page }) => {
  // Tall enough for every persona row to be in view while dragging.
  await page.setViewportSize({ width: 1440, height: 1200 });
  await startProject(page);
  const names = page.locator('.persona-row').getByRole('textbox', { name: 'Nom du persona' });
  const count = await names.count();
  for (let i = 0; i < count; i++) await names.nth(i).fill(`P${i + 1}`);
  // A line between the first and second persona.
  while ((await page.locator('.divider-row').count()) > 0) await page.locator('.divider-row').first().getByRole('button', { name: 'Supprimer la ligne de séparation' }).click();
  await page.locator('.persona-row').first().hover();
  await page.locator('.persona-row').first().getByRole('button', { name: 'Ajouter une ligne de séparation dessous' }).click();
  expect(await rowOrder(page)).toEqual(['P1', '—', ...Array.from({ length: count - 1 }, (_, i) => `P${i + 2}`)]);
  // P1 dragged onto P2: they swap, the line stays between the first two rows.
  await dragTo(page, page.locator('.persona-row').first().locator('.grip-persona'), page.locator('.persona-row').nth(1).locator('.persona'));
  expect((await rowOrder(page)).slice(0, 3)).toEqual(['P2', '—', 'P1']);
  // The line dragged to the lower half of the last persona goes under it.
  const last = page.locator('.persona-row').last();
  await dragTo(page, page.locator('.divider-row .grip-divider'), last, 20);
  const order = await rowOrder(page);
  expect(order.at(-1)).toBe('—');
  expect(order.slice(0, 2)).toEqual(['P2', 'P1']);
});

test('adds free text rows under the add persona button, each named and removable', async ({ page }) => {
  await startProject(page);
  const add = page.getByRole('button', { name: 'Ligne de texte libre' });
  await add.click();
  await add.click();
  const rows = page.locator('.info-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.getByRole('textbox', { name: 'Titre de la ligne (modifiable)' })).toHaveText(['Infos complémentaires', 'Texte libre']);
  // The add persona button sits right under the last persona, above the text rows.
  const addPersona = (await page.getByRole('button', { name: 'Ajouter un persona' }).boundingBox())!;
  const lastPersona = (await page.locator('.persona-row').last().boundingBox())!;
  const firstRow = (await rows.first().boundingBox())!;
  expect(addPersona.y).toBeGreaterThanOrEqual(lastPersona.y + lastPersona.height - 1);
  expect(addPersona.y).toBeLessThan(firstRow.y);
  await rows.nth(1).getByRole('textbox', { name: 'Informations complémentaires de l’étape' }).first().fill('Une note');
  await rows.first().getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.getByRole('textbox', { name: 'Titre de la ligne (modifiable)' })).toHaveText('Texte libre');
  await expect(rows.getByRole('textbox', { name: 'Informations complémentaires de l’étape' }).first()).toHaveValue('Une note');
});

test('renames a map and a flow from their tab, and shows long names in full', async ({ page }) => {
  await startProject(page);
  const long = 'Parcours patient — prise de rendez-vous en ligne et rappel la veille';
  const tab = page.locator('.doc-tab').first();
  await tab.locator('.doc-tab-btn').dblclick();
  const field = page.getByRole('textbox', { name: 'Nom de la map' });
  await field.fill(long);
  await field.press('Enter');
  await expect(tab).toHaveText(long);
  const btn = tab.locator('.doc-tab-btn');
  expect(await btn.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  // Escape leaves the name as it was.
  await tab.getByRole('button', { name: `Renommer ${long}` }).click();
  await page.getByRole('textbox', { name: 'Nom de la map' }).fill('Autre');
  await page.keyboard.press('Escape');
  await expect(tab).toHaveText(long);
  // The project name grows with its text, and shows in full on hover.
  const title = page.getByRole('textbox', { name: 'Nom du projet' });
  await title.fill('Clinique du Parc — parcours patient');
  expect(await title.evaluate((el: HTMLInputElement) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await title.fill(long);
  await expect(title).toHaveAttribute('title', long);
});

test('exports PowerPoint slides: one per document, a map cut into its phases, its text editable', async ({ page }) => {
  await startProject(page);
  await addActivity(page, 0, 0, 'Prendre rendez-vous');
  // A second document: a flow.
  await page.getByRole('button', { name: 'Nouveau flow' }).click();
  await page.locator('dialog[open] .tpl-card').filter({ hasText: 'Flow vide' }).click();
  await expect(page.locator('.doc-tab')).toHaveCount(2);
  const exportSlides = async () => {
    await page.getByRole('button', { name: 'Exporter…' }).click();
    await page.locator('input[name=export-format][value=pptx]').check({ force: true });
    const download = page.waitForEvent('download');
    await page.locator('dialog[open] .btn-primary').click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.pptx$/);
    const bytes = await readFile(await file.path());
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files)
      .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
      .sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10));
    return Promise.all(names.map((n) => zip.file(n)!.async('string')));
  };
  const options = async (fn: () => Promise<void>) => {
    await page.getByRole('button', { name: 'Exporter…' }).click();
    await page.locator('input[name=export-format][value=pptx]').check({ force: true });
    await fn();
    await page.keyboard.press('Escape');
  };
  // The map's three phases, then the flow; the activity is text in the first slide.
  let slides = await exportSlides();
  expect(slides).toHaveLength(4);
  expect(slides[0]).toContain('<a:t>Prendre rendez-vous</a:t>');
  expect(slides[0]).toContain('<a:t>Map · Avant</a:t>');
  expect(slides[0]).not.toContain('<p:pic>');
  // Back on the flow tab after the export, as before it.
  await expect(page.locator('.doc-tab.is-active')).toContainText('Flow');
  await options(() => page.getByRole('checkbox', { name: 'Maps : une diapositive par phase' }).uncheck());
  expect(await exportSlides()).toHaveLength(2);
  // As pictures: the text is in the image only.
  await options(() => page.getByRole('button', { name: 'Image', exact: true }).click());
  slides = await exportSlides();
  expect(slides[0]).toContain('<p:pic>');
  expect(slides[0]).not.toContain('Prendre rendez-vous');
  await options(() => page.getByRole('button', { name: 'Ce document' }).click());
  expect(await exportSlides()).toHaveLength(1);
});

test('stacks more than two cards under a step', async ({ page }) => {
  await startProject(page);
  const c = cell(page, 0, 0);
  if (!(await c.locator('[data-act]').count())) await addActivity(page, 0, 0, 'Par mail');
  for (const text of ['Par téléphone', 'Au guichet']) {
    await c.locator('[data-act]').last().hover();
    await c.getByRole('button', { name: 'Ajouter une alternative dessous (un autre choix possible)' }).click();
    await page.keyboard.type(text);
  }
  await expect(c.locator('[data-act]')).toHaveCount(3);
  await expect(c.locator('.alt-or')).toHaveCount(2);
  // Only the last card offers to add another one below.
  await expect(c.getByRole('button', { name: 'Ajouter une alternative dessous (un autre choix possible)' })).toHaveCount(1);
  // Removing the middle card moves the last one up.
  await c.locator('[data-act]').nth(1).hover();
  await c.locator('[data-act]').nth(1).getByRole('button', { name: 'Supprimer l’activité' }).click();
  await expect(c.locator('[data-act]')).toHaveCount(2);
  await expect(c.locator('[data-act] textarea').last()).toHaveValue('Au guichet');
});

test('reframes the image of a storyboard scene: drag to move, wheel to zoom', async ({ page }) => {
  await startProject(page);
  await page.getByRole('toolbar', { name: 'Outils et mise en forme' }).getByRole('button', { name: 'Storyboard' }).click();
  // A wide picture, so it can move sideways inside its block (not so wide that it starts whole).
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1200;
    c.height = 600;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#c33';
    ctx.fillRect(0, 0, 600, 600);
    ctx.fillStyle = '#33c';
    ctx.fillRect(600, 0, 600, 600);
    return c.toDataURL('image/png').split(',')[1];
  });
  const scene = page.locator('.scene').first();
  await scene.locator('input[type=file]').setInputFiles({ name: 'vue.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  const img = scene.locator('.scene-img img');
  await expect(img).toBeVisible();
  await expect(img).toHaveCSS('object-position', '50% 50%');

  await scene.getByRole('button', { name: 'Recadrer' }).click();
  const frame = scene.locator('.scene-img');
  await expect(frame).toHaveClass(/is-reframing/);
  const box = (await frame.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 60, box.y + 40, { steps: 6 });
  await page.mouse.up();
  // Dragging left shows more of the right of the picture.
  const x = await img.evaluate((el) => parseFloat(el.style.objectPosition));
  expect(x).toBeGreaterThan(55);

  await page.mouse.move(box.x + box.width / 2, box.y + 40);
  await page.mouse.wheel(0, -100);
  await expect(img).toHaveCSS('transform', /matrix\(1\.1/);

  await scene.getByRole('button', { name: 'OK' }).click();
  await expect(frame).not.toHaveClass(/is-reframing/);
  await expect(scene.getByRole('button', { name: 'Recadrer' })).toBeVisible();

  // Centre goes back to the picture as it was added.
  await scene.getByRole('button', { name: 'Recadrer' }).click();
  await scene.getByRole('button', { name: 'Centrer' }).click();
  await expect(img).toHaveCSS('object-position', '50% 50%');
  await page.keyboard.press('Escape');
  await expect(frame).not.toHaveClass(/is-reframing/);
});

test('gives every storyboard image the same frame, whole or filling it', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await startProject(page);
  await page.getByRole('toolbar', { name: 'Outils et mise en forme' }).getByRole('button', { name: 'Storyboard' }).click();
  const picture = (w: number, h: number) =>
    page.evaluate(([w, h]) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#2a6';
      ctx.fillRect(0, 0, w, h);
      return c.toDataURL('image/png').split(',')[1];
    }, [w, h]);
  const scenes = page.locator('.scene');
  const add = async (i: number, w: number, h: number, name: string) =>
    scenes.nth(i).locator('input[type=file]').setInputFiles({ name, mimeType: 'image/png', buffer: Buffer.from(await picture(w, h), 'base64') });
  // A photo close to 4:3, then a phone screenshot.
  await add(0, 800, 600, 'photo.png');
  await add(1, 390, 845, 'capture.png');
  const frames = page.locator('.scene-img');
  await expect(frames).toHaveCount(2);

  // New maps use 4:3: both frames have the same size.
  const format = page.getByRole('combobox', { name: 'Format des images' });
  await expect(format).toHaveValue('4:3');
  const [a, b] = [(await frames.nth(0).boundingBox())!, (await frames.nth(1).boundingBox())!];
  expect(Math.abs(a.width - b.width)).toBeLessThan(1);
  expect(Math.abs(a.width / a.height - 4 / 3)).toBeLessThan(0.02);

  // The photo fills its frame; the screenshot arrives whole.
  await expect(frames.nth(0)).not.toHaveClass(/is-whole/);
  await expect(frames.nth(1)).toHaveClass(/is-whole/);
  await expect(frames.nth(1).locator('img').last()).toHaveCSS('object-fit', 'contain');
  await expect(scenes.nth(1).getByRole('button', { name: 'Recadrer' })).toHaveCount(0);

  // Each image can switch on its own.
  await scenes.nth(1).getByRole('button', { name: 'Remplir le cadre' }).click();
  await expect(frames.nth(1)).not.toHaveClass(/is-whole/);
  await expect(scenes.nth(1).getByRole('button', { name: 'Recadrer' })).toBeVisible();
  await scenes.nth(0).getByRole('button', { name: 'Afficher l’image entière' }).click();
  await expect(frames.nth(0)).toHaveClass(/is-whole/);

  // Another format resizes every frame alike.
  await format.selectOption('3:4');
  const c = (await frames.nth(0).boundingBox())!;
  expect(Math.abs(c.width / c.height - 3 / 4)).toBeLessThan(0.02);

  // Back to the step width: 150 px high, as wide as the step.
  await format.selectOption('');
  const d = (await frames.nth(0).boundingBox())!;
  expect(Math.round(d.height)).toBe(150);
});

test('moves a phase with its steps and activities', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await startProject(page);
  const phases = page.locator('.phase');
  const phaseNames = phases.getByRole('textbox', { name: 'Nom de la phase' });
  const stepNames = page.locator('.step').getByRole('textbox', { name: 'Nom de l’étape' });
  const count = await phases.count();
  expect(count).toBeGreaterThan(1);
  for (let k = 0; k < count; k++) await phaseNames.nth(k).fill(`Ph${k + 1}`);
  const nSteps = await stepNames.count();
  for (let i = 0; i < nSteps; i++) await stepNames.nth(i).fill(`E${i + 1}`);
  await addActivity(page, 0, 0, 'Première activité');
  // The first phase dropped on the second one: it moves after it, its steps with it.
  await dragTo(page, phases.first().locator('.grip-phase'), phases.nth(1));
  await expect(phaseNames.nth(0)).toHaveValue('Ph2');
  await expect(phaseNames.nth(1)).toHaveValue('Ph1');
  const order = await stepNames.evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
  expect(order.indexOf('E1')).toBeGreaterThan(0);
  // The activity of the first step went along: it sits under E1 wherever E1 is now.
  await expect(cell(page, 0, order.indexOf('E1')).locator('textarea').first()).toHaveValue('Première activité');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(phaseNames.nth(0)).toHaveValue('Ph1');
});
