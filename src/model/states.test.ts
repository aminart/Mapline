// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { exampleProject } from './fixtures';
import { addDoc, missionMapOf, projectPersonas, removeDoc, sheetFor, updateFlow, updateMap } from './project';
import { baselineOf, detachTarget, diffCounts, diffFlow, diffMap, makeTarget, restoreActivity, restoreNode, targetsOf } from './states';
import { parse, serialize } from './serialize';
import * as ops from './ops';
import * as fo from './flow';
import type { FlowDoc, PersonaSheetDoc, Project } from './types';

const labels = { start: 'Début', end: 'Fin', yes: 'Oui', no: 'Non' };

function withTarget(): { project: Project; current: string; target: string } {
  const project = exampleProject();
  const current = project.docs[0].id;
  const r = makeTarget(project, current, 'Map · cible');
  return { project: r.project, current, target: r.docId! };
}

describe('target states', () => {
  it('copies a map as its target state, right after it, with the same cards', () => {
    const { project, current, target } = withTarget();
    expect(project.docs.map((d) => d.id)).toEqual([current, target]);
    expect(baselineOf(project, target)?.id).toBe(current);
    expect(targetsOf(project, current).map((d) => d.id)).toEqual([target]);
    expect(missionMapOf(project, target)!.map).toEqual(missionMapOf(project, current)!.map);
    expect(diffCounts(diffMap(missionMapOf(project, current)!.map, missionMapOf(project, target)!.map))).toEqual({ added: 0, modified: 0, removed: 0 });
  });

  it('finds the activities added, changed, moved and removed', () => {
    const { project, current, target } = withTarget();
    const base = missionMapOf(project, current)!.map;
    const [k1, k2, k3] = Object.keys(base.activities);
    let map = missionMapOf(project, target)!.map;
    map = ops.setActivityText(map, k1, 'Réserve en 3 clics');
    map = ops.removeActivity(map, k2);
    const empty = `${map.personas[2].id}:${map.steps[0].slots[0]}`;
    map = ops.moveActivity(map, k3, empty);
    const added = ops.createActivity(map, map.personas[1].id, map.steps[0].slots[0], 'activity');
    map = added.doc;
    const diff = diffMap(base, map);
    expect(diff.changes[base.activities[k1].id]).toBe('modified');
    expect(diff.before[base.activities[k1].id]).toBe(base.activities[k1].text);
    expect(diff.changes[base.activities[k3].id]).toBe('modified');
    expect(diff.before[base.activities[k3].id]).toBeUndefined();
    expect(diff.changes[added.activityId]).toBe('added');
    expect(diff.removed.map((r) => r.key)).toEqual([k2]);
    expect(diffCounts(diff)).toEqual({ added: 1, modified: 2, removed: 1 });
    // Put back where it was.
    const back = restoreActivity(map, k2, base.activities[k2]);
    expect(back.activities[k2]).toEqual(base.activities[k2]);
  });

  it('compares flows card by card; moving a card is not a change', () => {
    let project = exampleProject();
    const flowDoc: FlowDoc = { id: 'f1', kind: 'flow', name: 'Réserver', flow: fo.templateFlow('user', labels) };
    project = addDoc(project, flowDoc);
    const r = makeTarget(project, 'f1', 'Réserver · cible');
    project = r.project;
    const base = flowDoc.flow;
    const [start, first, choice] = base.nodes;
    project = updateFlow(project, r.docId!, (f) => {
      let next = fo.setNode(f, first.id, { text: 'Ouvre l’app' });
      next = fo.moveNode(next, start.id, 0, 3);
      next = fo.removeNode(next, choice.id);
      return next;
    });
    const target = (project.docs.find((d) => d.id === r.docId) as FlowDoc).flow;
    const diff = diffFlow(base, target);
    expect(diff.changes).toEqual({ [first.id]: 'modified' });
    expect(diff.removed.map((n) => n.id)).toEqual([choice.id]);
    const back = restoreNode(target, base, choice);
    expect(back.nodes.find((n) => n.id === choice.id)).toEqual(choice);
    expect(back.links.filter((l) => l.from === choice.id || l.to === choice.id).length).toBeGreaterThan(0);
  });

  it('is saved in the project file', () => {
    const { project, target, current } = withTarget();
    const back = parse(serialize(project));
    expect(baselineOf(back, target)?.id).toBe(current);
  });

  it('stops comparing when the current state is removed, or on request', () => {
    const { project, current, target } = withTarget();
    expect(baselineOf(removeDoc(project, current), target)).toBeUndefined();
    expect(baselineOf(detachTarget(project, target), target)).toBeUndefined();
    expect(missionMapOf(detachTarget(project, target), target)).toBeDefined();
  });

  it('shares the persona sheets and lists each persona once', () => {
    let { project, current, target } = withTarget();
    const persona = missionMapOf(project, current)!.map.personas[0];
    const sheet = { id: 's1', kind: 'persona', name: '', sheet: { link: { docId: current, personaId: persona.id } } } as unknown as PersonaSheetDoc;
    project = addDoc(project, sheet);
    expect(sheetFor(project, target, persona.id)?.id).toBe('s1');
    expect(projectPersonas(project).filter((p) => p.persona.id === persona.id)).toHaveLength(1);
    // A persona added to the target only is listed too.
    project = updateMap(project, target, ops.addPersona);
    expect(projectPersonas(project)).toHaveLength(4);
  });
});
