// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import * as sheetOps from './sheet';
import { exampleProject } from './fixtures';
import { addDoc, firstDocId, linkedPersona, missionMapOf, personaFootprint, removeDoc, setSheetIdentity, setSheetSync, sheetFor, sheetIdentity, sheetOf, updateMap } from './project';
import { createSheet, createSheetProject, sheetDoc } from './templates';
import { parse, serialize } from './serialize';
import { removePersona } from './ops';
import type { PersonaSheet } from './types';

const blank = (): PersonaSheet => createSheet('blank', 'fr');

describe('sheet templates', () => {
  it('builds the classic persona with its blocks, in both languages', () => {
    const fr = createSheet('classic', 'fr');
    expect(fr.blocks.map((b) => b.title)).toEqual(['Objectifs', 'Frustrations', 'Motivations', 'Comportements', 'Canaux et outils', 'Scénario']);
    expect(fr.blocks.map((b) => b.view)).toEqual(['list', 'list', 'gauges', 'list', 'tags', 'text']);
    expect(fr.fields.map((f) => f.label)).toEqual(['Âge', 'Lieu', 'Situation']);
    expect(createSheet('classic', 'en').blocks[0].title).toBe('Goals');
    expect(fr.link).toBeNull();
    expect(blank().blocks).toEqual([]);
  });

  it('starts a sheet from a mission map persona, linked and in sync', () => {
    const project = exampleProject();
    const mapId = firstDocId(project);
    const persona = missionMapOf(project, mapId)!.map.personas[0];
    const sheet = createSheet('classic', 'fr', { persona, mapDocId: mapId });
    expect(sheet.name).toBe('Patient');
    expect(sheet.link).toEqual({ docId: mapId, personaId: persona.id });
    expect(sheet.sync).toBe(true);
  });

  it('makes a project with a standalone sheet', () => {
    const project = createSheetProject('classic', 'fr');
    expect(project.title).toBe('Nouvelle fiche persona');
    expect(project.docs.map((d) => d.kind)).toEqual(['persona']);
  });
});

describe('sheet blocks', () => {
  it('adds, edits, moves and removes blocks and their lines', () => {
    let sheet = sheetOps.addBlock(blank(), sheetOps.newBlock('Objectifs', 'list', '#2F55D4'));
    sheet = sheetOps.addBlock(sheet, sheetOps.newBlock('Scénario', 'text', '#BE185D'));
    sheet = sheetOps.addBlock(sheet, sheetOps.newBlock('Freins', 'list', '#C2410C'), 1);
    expect(sheet.blocks.map((b) => b.title)).toEqual(['Objectifs', 'Freins', 'Scénario']);
    const goals = sheet.blocks[0];
    const first = goals.items[0].id;
    sheet = sheetOps.setItem(sheet, goals.id, first, { text: 'Réserver vite' });
    const added = sheetOps.addItem(sheet, goals.id, first, 'Être rappelé');
    sheet = added.sheet;
    expect(sheet.blocks[0].items.map((i) => i.text)).toEqual(['Réserver vite', 'Être rappelé']);
    expect(sheetOps.addItem(sheet, sheet.blocks[2].id).itemId).toBeNull(); // text blocks have no lines
    sheet = sheetOps.removeItem(sheet, goals.id, added.itemId!);
    sheet = sheetOps.moveBlock(sheet, 2, 0);
    expect(sheet.blocks.map((b) => b.title)).toEqual(['Scénario', 'Objectifs', 'Freins']);
    sheet = { ...sheet, styles: { [`block:${goals.id}`]: { bg: '#FFF4C2' } } };
    sheet = sheetOps.removeBlock(sheet, goals.id);
    expect(sheet.blocks.map((b) => b.title)).toEqual(['Scénario', 'Freins']);
    expect(sheet.styles).toEqual({});
  });

  it('keeps gauge levels between 0 and 100', () => {
    let sheet = sheetOps.addBlock(blank(), sheetOps.newBlock('Motivations', 'gauges', '#0F766E'));
    const block = sheet.blocks[0];
    expect(block.items[0].level).toBe(sheetOps.DEFAULT_LEVEL);
    sheet = sheetOps.setItem(sheet, block.id, block.items[0].id, { level: 140 });
    expect(sheet.blocks[0].items[0].level).toBe(100);
    sheet = sheetOps.setItem(sheet, block.id, block.items[0].id, { level: -3 });
    expect(sheet.blocks[0].items[0].level).toBe(0);
  });

  it('changes a block’s display without losing what was typed', () => {
    let sheet = sheetOps.addBlock(blank(), sheetOps.newBlock('Canaux', 'list', '#A16207', ['SMS', 'Téléphone']));
    const id = sheet.blocks[0].id;
    sheet = sheetOps.setBlockView(sheet, id, 'gauges');
    expect(sheet.blocks[0].items.map((i) => [i.text, i.level])).toEqual([['SMS', 50], ['Téléphone', 50]]);
    sheet = sheetOps.setBlockView(sheet, id, 'text');
    expect(sheet.blocks[0].text).toBe('SMS\nTéléphone');
    sheet = sheetOps.setBlockView(sheet, id, 'tags');
    expect(sheet.blocks[0].items.map((i) => i.text)).toEqual(['SMS', 'Téléphone']);
    expect(sheet.blocks[0].items[0].level).toBeUndefined();
  });

  it('edits the identity fields and tags', () => {
    let sheet = sheetOps.addField(blank(), 'Âge').sheet;
    const field = sheet.fields[0].id;
    sheet = sheetOps.setField(sheet, field, { value: '35 ans' });
    expect(sheet.fields[0]).toMatchObject({ label: 'Âge', value: '35 ans' });
    sheet = sheetOps.addSheetTag(sheet, ' pressé ');
    sheet = sheetOps.addSheetTag(sheet, 'Pressé');
    expect(sheet.tags).toEqual(['pressé']);
    sheet = sheetOps.removeSheetTag(sheetOps.removeField(sheet, field), 'pressé');
    expect([sheet.fields, sheet.tags]).toEqual([[], []]);
  });
});

describe('sheets in a project', () => {
  function withSheet() {
    const base = exampleProject();
    const mapId = firstDocId(base);
    const persona = missionMapOf(base, mapId)!.map.personas[0];
    const doc = sheetDoc(createSheet('classic', 'fr', { persona, mapDocId: mapId }));
    return { project: addDoc(base, doc), mapId, persona, sheetId: doc.id };
  }

  it('finds the sheet of a persona and the persona of a sheet', () => {
    const { project, mapId, persona, sheetId } = withSheet();
    expect(sheetFor(project, mapId, persona.id)?.id).toBe(sheetId);
    expect(linkedPersona(project, sheetOf(project, sheetId)!.sheet)?.persona.id).toBe(persona.id);
  });

  it('keeps the name in sync both ways while linked', () => {
    const { project, mapId, persona, sheetId } = withSheet();
    let next = setSheetIdentity(project, sheetId, { name: 'Patiente' });
    expect(missionMapOf(next, mapId)!.map.personas[0].name).toBe('Patiente');
    expect(sheetOf(next, sheetId)!.sheet.name).toBe('Patiente');
    // Renamed in the mission map: the sheet shows the new name.
    next = updateMap(next, mapId, (m) => ({ ...m, personas: m.personas.map((p) => (p.id === persona.id ? { ...p, name: 'Client' } : p)) }));
    expect(sheetIdentity(next, sheetOf(next, sheetId)!.sheet).name).toBe('Client');
  });

  it('goes its own way once sync is off, or once the persona is gone', () => {
    const { project, mapId, sheetId, persona } = withSheet();
    const off = setSheetSync(project, sheetId, false);
    const renamed = setSheetIdentity(off, sheetId, { name: 'Autre' });
    expect(missionMapOf(renamed, mapId)!.map.personas[0].name).toBe('Patient');
    expect(sheetIdentity(renamed, sheetOf(renamed, sheetId)!.sheet)).toMatchObject({ name: 'Autre', synced: false });
    const gone = updateMap(project, mapId, (m) => removePersona(m, persona.id));
    expect(sheetIdentity(gone, sheetOf(gone, sheetId)!.sheet)).toMatchObject({ name: 'Patient', synced: false });
  });

  it('removes a document but never the last one', () => {
    const { project, mapId, sheetId } = withSheet();
    const noMap = removeDoc(project, mapId);
    expect(noMap.docs.map((d) => d.id)).toEqual([sheetId]);
    expect(sheetOf(noMap, sheetId)!.sheet.link).toBeNull();
    expect(removeDoc(noMap, sheetId)).toBe(noMap);
  });

  it('round-trips sheets through the project file', () => {
    const { project } = withSheet();
    expect(parse(serialize(project))).toEqual(project);
  });

  it('counts where a persona appears in the mission map', () => {
    const { project, mapId, persona } = withSheet();
    const map = missionMapOf(project, mapId)!.map;
    expect(personaFootprint(map, persona.id)).toEqual({ steps: 5, activities: 6, tags: [] });
  });
});
