// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { exampleBlueprint, exampleProject } from './fixtures';
import { ProjectFileError, parse, serialize } from './serialize';
import { findDoc, firstDocId, missionMapOf, projectFromMap, setProjectTitle, updateMap } from './project';
import { createFromTemplate } from './templates';
import type { MissionMapDoc } from './types';
import { setStepTitle } from './ops';

describe('project files', () => {
  it('round-trips a project with its documents', () => {
    const project = exampleProject();
    const back = parse(serialize(project));
    expect(back).toEqual(project);
  });

  it('reads a file from before 0.10 as a project with one map', () => {
    const map = exampleBlueprint();
    const legacy = JSON.stringify({ version: 1, title: 'Ancien projet', ...map });
    const project = parse(legacy);
    expect(project.version).toBe(2);
    expect(project.title).toBe('Ancien projet');
    expect(project.docs).toHaveLength(1);
    const doc = project.docs[0];
    if (doc.kind !== 'mission-map') throw new Error('not a map');
    expect(doc.map.steps).toEqual(map.steps);
    expect(doc.map.activities).toEqual(map.activities);
    // Files without a version number came from 0.1.
    expect((parse(JSON.stringify({ title: 'Sans version', ...map })).docs[0] as MissionMapDoc).map.personas).toEqual(map.personas);
  });

  it('refuses files from a newer app, and damaged ones', () => {
    const project = exampleProject();
    const reason = (text: string) => {
      try {
        parse(text);
        return 'ok';
      } catch (err) {
        return err instanceof ProjectFileError ? err.reason : 'other';
      }
    };
    expect(reason(JSON.stringify({ ...project, version: 3 }))).toBe('newer');
    expect(reason(JSON.stringify({ ...project, docs: [{ id: 'x', kind: 'whiteboard', name: '' }] }))).toBe('newer');
    expect(reason(JSON.stringify({ ...project, docs: [] }))).toBe('invalid');
    expect(reason(JSON.stringify({ ...project, docs: [{ id: 'x', kind: 'mission-map', name: '', map: {} }] }))).toBe('invalid');
    expect(reason('[]')).toBe('invalid');
  });
});

describe('project operations', () => {
  it('changes one map and keeps the rest of the project as is', () => {
    const project = projectFromMap('P', exampleBlueprint());
    const id = firstDocId(project);
    const stepId = missionMapOf(project, id)!.map.steps[0].id;
    const next = updateMap(project, id, (m) => setStepTitle(m, stepId, 'Recherche'));
    expect(missionMapOf(next, id)!.map.steps[0].title).toBe('Recherche');
    expect(missionMapOf(project, id)!.map.steps[0].title).toBe('Découverte');
    // No change, no new object: undo history stays clean.
    expect(updateMap(project, id, (m) => m)).toBe(project);
    expect(updateMap(project, 'missing', (m) => setStepTitle(m, stepId, 'x'))).toBe(project);
    expect(findDoc(project, 'missing')).toBeUndefined();
  });

  it('renames a project', () => {
    const project = createFromTemplate('mission-map', 'fr');
    expect(project.title).toBe('Nouvelle map');
    expect(setProjectTitle(project, 'Nouvelle map')).toBe(project);
    expect(setProjectTitle(project, 'Onboarding').title).toBe('Onboarding');
  });
});
