// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { buildCsv } from './exportCsv';
import { exampleBlueprint } from '../model/fixtures';
import { addAlternative, addDivider, addTag, activityKey, altKey, DIVIDER_TOP, setActivityNote, setActivityText, addTextRow, setTextCell, setTextRow, setJoiner } from '../model/ops';

const labels = { objective: 'Objectif', phases: 'Phases', steps: 'Étapes', storyboard: 'Storyboard', note: 'Note', or: 'ou', info: 'Infos' };

describe('buildCsv', () => {
  it('lays out steps as columns and personas as rows', () => {
    let doc = exampleBlueprint();
    const patient = doc.personas[0];
    const slot = doc.steps[1].slots[0];
    doc = addTag(doc, activityKey(patient.id, slot), 'mobile');
    doc = addDivider(doc, doc.personas[1].id, 'Ligne de visibilité');
    doc = setActivityNote(doc, activityKey(patient.id, doc.steps[0].slots[0]), 'à creuser');
    const csv = buildCsv(doc, labels, ';');
    expect(csv.startsWith('﻿Objectif;Permettre')).toBe(true);
    const lines = csv.split('\r\n');
    expect(lines[2]).toBe('Phases;Avant la visite;Avant la visite;Avant la visite;Pendant;Après');
    expect(lines[3]).toBe('Étapes;Découverte;Prise de rendez-vous;Confirmation;Consultation;Suivi');
    expect(lines[4].startsWith('Storyboard;')).toBe(true);
    expect(csv).toContain('Cherche un praticien disponible près de chez lui (Note : à creuser)');
    // Two activities side by side in step 2 share a quoted, multi-line cell.
    expect(csv).toContain('"Choisit un créneau [mobile]\nRenseigne ses informations"');
    expect(lines.findIndex((l) => l === '— Ligne de visibilité —')).toBe(lines.findIndex((l) => l.startsWith('Secrétaire')) + 1);
  });

  it('puts a separator above the first persona before its row', () => {
    const doc = addDivider(exampleBlueprint(), DIVIDER_TOP, 'Client');
    const lines = buildCsv(doc, labels, ';').split('\r\n');
    expect(lines.findIndex((l) => l === '— Client —')).toBe(lines.findIndex((l) => l.startsWith('Patient')) - 1);
  });

  it('lists an alternative after its card and adds the free text rows', () => {
    let doc = exampleBlueprint();
    const key = activityKey(doc.personas[0].id, doc.steps[0].slots[0]);
    doc = addAlternative(doc, key).doc;
    doc = setActivityText(doc, altKey(key), 'Appelle le cabinet');
    const row = addTextRow(doc, 'Infos');
    doc = setTextCell(row.doc, row.rowId, doc.steps[0].id, 'Mobile');
    const csv = buildCsv(doc, labels, ';');
    expect(csv).toContain('"Cherche un praticien disponible près de chez lui\nou Appelle le cabinet"');
    expect(csv.split('\r\n')).toContain('Infos;Mobile;;;;');
    const renamed = buildCsv(setTextRow(setJoiner(doc, altKey(key), 'sinon'), row.rowId, { title: 'Canaux' }), labels, ';');
    expect(renamed).toContain('sinon Appelle le cabinet');
    expect(renamed.split('\r\n')).toContain('Canaux;Mobile;;;;');
  });

  it('quotes cells containing the separator or quotes', () => {
    const doc = exampleBlueprint();
    doc.objective = 'Dire "oui", vite';
    expect(buildCsv(doc, labels, ',')).toContain('"Dire ""oui"", vite"');
  });
});
