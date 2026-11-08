// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { exampleProject } from './fixtures';
import { addDoc, duplicateMap, missionMapOf, projectPersonas, removeDoc, sheetFor, sheetOf, updateMap } from './project';
import { createSheet, sheetDoc } from './templates';
import { parse, serialize } from './serialize';
import type { Project } from './types';

/** The example project, with a sheet for its first persona. */
function withSheet(): { project: Project; mapId: string; personaId: string; sheetId: string } {
  let project = exampleProject();
  const mapId = project.docs[0].id;
  const persona = missionMapOf(project, mapId)!.map.personas[0];
  const doc = sheetDoc(createSheet('classic', 'fr', { persona, mapDocId: mapId }));
  project = addDoc(project, doc);
  return { project, mapId, personaId: persona.id, sheetId: doc.id };
}

describe('map copies', () => {
  it('duplicates a whole map right after it, sharing its persona sheets', () => {
    const { project, mapId, personaId, sheetId } = withSheet();
    const r = duplicateMap(project, mapId, 'Map (copie)', 'all');
    const copy = missionMapOf(r.project, r.docId!)!;
    expect(r.project.docs.map((d) => d.id).slice(0, 2)).toEqual([mapId, copy.id]);
    expect(copy.name).toBe('Map (copie)');
    expect(copy.map).toEqual(missionMapOf(project, mapId)!.map);
    expect(sheetFor(r.project, copy.id, personaId)?.id).toBe(sheetId);
    // Each persona is still listed once, for the flows.
    expect(projectPersonas(r.project)).toHaveLength(projectPersonas(project).length);
    // Editing the copy leaves the original alone.
    const edited = updateMap(r.project, copy.id, (m) => ({ ...m, objective: 'Autre objectif' }));
    expect(missionMapOf(edited, mapId)!.map.objective).toBe(missionMapOf(project, mapId)!.map.objective);
  });

  it('copies only the personas onto an empty map', () => {
    const { project, mapId } = withSheet();
    const source = missionMapOf(project, mapId)!.map;
    const r = duplicateMap(project, mapId, 'Map (copie)', 'personas');
    const map = missionMapOf(r.project, r.docId!)!.map;
    expect(map.personas).toEqual(source.personas);
    expect(map.objective).toBe('');
    expect(map.steps).toHaveLength(1);
    expect(map.phases).toEqual([expect.objectContaining({ span: 1 })]);
    expect(map.activities).toEqual({});
    expect(map.links).toEqual([]);
    expect(map.dividers.map((d) => [d.after, d.label])).toEqual(source.dividers.map((d) => [d.after, d.label]));
    for (const key of Object.keys(map.styles)) expect(key === 'obj' || key.startsWith('persona:')).toBe(true);
  });

  it('keeps the link to the original in the file', () => {
    const { project, mapId } = withSheet();
    const r = duplicateMap(project, mapId, 'Copie', 'personas');
    expect(missionMapOf(parse(serialize(r.project)), r.docId!)!.origin).toBe(mapId);
  });

  it('hands the sheets over to the copy when the original is removed', () => {
    const { project, mapId, personaId, sheetId } = withSheet();
    const r = duplicateMap(project, mapId, 'Copie', 'personas');
    const after = removeDoc(r.project, mapId);
    expect(sheetOf(after, sheetId)!.sheet.link).toEqual({ docId: r.docId, personaId });
    expect(missionMapOf(after, r.docId!)!.origin).toBeUndefined();
  });
});
