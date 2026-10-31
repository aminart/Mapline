// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { exampleProject } from './fixtures';
import { addDetailFlow, flowsDetailing, personaFlows, removeDetailed, resolveSource, setFlowPersona, setFlowSource } from './links';
import { renameSheetTag } from './sheet';
import { addDoc, flowOf, removeDoc, updateMap } from './project';
import { parse, serialize } from './serialize';
import { createFlowDoc } from './templates';
import * as fo from './flow';
import * as ops from './ops';
import type { MissionMapDoc } from './types';

function setup() {
  const project = exampleProject();
  const map = project.docs[0] as MissionMapDoc;
  return { project, map: map.map, mapId: map.id };
}

describe('flows detailing a map', () => {
  it('details an activity in a new flow named after it, with its persona', () => {
    const { project, map, mapId } = setup();
    const [key, act] = Object.entries(map.activities)[1];
    const doc = createFlowDoc('blank', 'fr');
    const next = addDetailFlow(project, doc, { docId: mapId, kind: 'act', id: act.id });
    const flow = flowOf(next, doc.id)!;
    expect(flow.name).toBe('Choisit un créneau');
    expect(flow.flow.personaId).toBe(key.split(':')[0]);
    expect(flowsDetailing(next, mapId, 'act', act.id).map((d) => d.id)).toEqual([doc.id]);
    expect(resolveSource(next, flow.flow.source)).toMatchObject({ step: 2, title: 'Choisit un créneau' });
  });

  it('links phases and steps, unlinks, and forgets a removed map', () => {
    const { project, map, mapId } = setup();
    const flowDoc = createFlowDoc('user', 'fr', 'Réserver');
    let p = addDoc(project, flowDoc);
    p = setFlowSource(p, flowDoc.id, { docId: mapId, kind: 'phase', id: map.phases[0].id });
    expect(resolveSource(p, flowOf(p, flowDoc.id)!.flow.source)).toMatchObject({ title: 'Avant la visite', personaId: null });
    p = setFlowSource(p, flowDoc.id, { docId: mapId, kind: 'step', id: map.steps[2].id });
    expect(resolveSource(p, flowOf(p, flowDoc.id)!.flow.source)).toMatchObject({ step: 3, title: 'Confirmation' });
    expect(flowsDetailing(p, mapId, 'phase', map.phases[0].id)).toEqual([]);
    expect(flowOf(setFlowSource(p, flowDoc.id, null), flowDoc.id)!.flow.source).toBeUndefined();
    // Removing the map: the flow stays, without its source.
    const other = createFlowDoc('blank', 'fr');
    const removed = removeDoc(addDoc(p, other), mapId);
    expect(flowOf(removed, flowDoc.id)!.flow.source).toBeUndefined();
  });

  it('lists the flows a persona is in, as main persona or on a card', () => {
    const { project, map } = setup();
    const secretary = map.personas[1].id;
    const flowDoc = createFlowDoc('blank', 'fr', 'Agenda');
    let p = addDoc(project, { ...flowDoc, flow: setFlowPersona(flowDoc.flow, secretary) });
    expect(personaFlows(p, secretary).map((f) => f.id)).toEqual([flowDoc.id]);
    p = { ...p, docs: p.docs.map((d) => (d.kind === 'flow' ? { ...d, flow: setFlowPersona(d.flow, null) } : d)) };
    expect(personaFlows(p, secretary)).toEqual([]);
    const card = flowDoc.flow.nodes[0].id;
    p = { ...p, docs: p.docs.map((d) => (d.kind === 'flow' ? { ...d, flow: fo.setNode(d.flow, card, { personaId: secretary }) } : d)) };
    expect(personaFlows(p, secretary).map((f) => f.id)).toEqual([flowDoc.id]);
  });

  it('saves the links, the main persona and the free text', () => {
    const { project, map, mapId } = setup();
    const doc = createFlowDoc('blank', 'fr');
    let p = addDetailFlow(project, doc, { docId: mapId, kind: 'step', id: map.steps[0].id });
    p = { ...p, docs: p.docs.map((d) => (d.kind === 'flow' ? { ...d, flow: fo.setBrief(setFlowPersona(d.flow, 'x'), { brief: 'Objectifs', briefTitle: 'But' }) } : d)) };
    const back = parse(serialize(p));
    const flow = flowOf(back, doc.id)!.flow;
    expect(flow.source).toEqual({ docId: mapId, kind: 'step', id: map.steps[0].id });
    expect([flow.personaId, flow.brief, flow.briefTitle]).toEqual(['x', 'Objectifs', 'But']);
  });
});

describe('removing a detailed step', () => {
  it('unlinks its flows in the same change', () => {
    const { project, map, mapId } = setup();
    const doc = createFlowDoc('blank', 'fr');
    const step = map.steps[1];
    const p = addDetailFlow(project, doc, { docId: mapId, kind: 'step', id: step.id });
    const next = removeDetailed(p, mapId, 'step', step.id, (q) => updateMap(q, mapId, (m) => ops.removeStep(m, 1)));
    expect(flowOf(next, doc.id)!.flow.source).toBeUndefined();
    expect((next.docs[0] as MissionMapDoc).map.steps.some((s) => s.id === step.id)).toBe(false);
  });
});

describe('editing a tag from its card', () => {
  it('renames on one card or on all, keeping the colour', () => {
    const { map } = setup();
    const keys = Object.keys(map.activities);
    let doc = ops.addTag(ops.addTag(map, keys[0], 'irritant'), keys[1], 'irritant');
    doc = ops.setTagColor(doc, 'irritant', 4);
    expect(ops.tagUses(doc, 'Irritant')).toBe(2);
    const one = ops.renameTag(doc, keys[0], 'irritant', 'Douleur');
    expect(one.activities[keys[0]].tags).toEqual(['Douleur']);
    expect(one.activities[keys[1]].tags).toEqual(['irritant']);
    expect(one.tagColors).toEqual({ irritant: 4, douleur: 4 });
    const all = ops.renameTag(doc, null, 'irritant', 'Douleur');
    expect(ops.tagUses(all, 'douleur')).toBe(2);
    expect(all.tagColors).toEqual({ douleur: 4 });
    expect(ops.renameTag(doc, null, 'irritant', '  ')).toBe(doc);
    // Merges with a tag the card already has.
    const both = ops.addTag(doc, keys[0], 'Email');
    expect(ops.renameTag(both, keys[0], 'irritant', 'email').activities[keys[0]].tags).toEqual(['email']);
  });

  it('renames a persona sheet’s tag, its colour following', () => {
    const sheet = { tags: ['Mobile', 'Pressée'], tagColors: { mobile: 2 } } as unknown as Parameters<typeof renameSheetTag>[0];
    const next = renameSheetTag(sheet, 'Mobile', 'Smartphone');
    expect(next.tags).toEqual(['Smartphone', 'Pressée']);
    expect(next.tagColors).toEqual({ smartphone: 2 });
  });

  it('does the same on flow cards', () => {
    let flow = fo.templateFlow('user', { start: 'Début', end: 'Fin', yes: 'Oui', no: 'Non' });
    const [, a, b] = flow.nodes;
    flow = fo.addNodeTag(fo.addNodeTag(flow, a.id, 'irritant'), b.id, 'irritant');
    expect(fo.flowTagUses(flow, 'irritant')).toBe(2);
    const one = fo.renameNodeTag(flow, a.id, 'irritant', 'Douleur');
    expect(fo.findNode(one, b.id)!.tags).toEqual(['irritant']);
    expect(fo.flowTagUses(fo.renameNodeTag(flow, null, 'irritant', 'Douleur'), 'douleur')).toBe(2);
  });
});
