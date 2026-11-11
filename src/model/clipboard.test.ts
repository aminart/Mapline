// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import * as ops from './ops';
import * as fo from './flow';
import { clipFromFlow, clipFromMap, pasteInCell, pasteInFlow, pasteOnMap } from './clipboard';
import type { Blueprint } from './types';

const labels = { start: 'Début', end: 'Fin', yes: 'Oui', no: 'Non' };

/** One persona, two steps of one column each; a styled, tagged card in the first. */
function map(): { doc: Blueprint; key: string; id: string } {
  const doc: Blueprint = {
    objective: '', phases: [], personas: [{ id: 'p', name: 'Léa', role: '', color: 0 }, { id: 'q', name: 'Tom', role: '', color: 1 }],
    steps: [{ id: 's1', title: '', slots: ['a'] }, { id: 's2', title: '', slots: ['b'] }],
    activities: { 'p:a': { id: 'x', text: 'Remplit le formulaire', tags: ['Irritant'], note: 'Trop long', kind: 'choice' } },
    scenes: {}, links: [], dividers: [], tagColors: { irritant: 3, autre: 1 }, styles: { 'act:x': { bg: '#FFEEEE' } }, storyboard: false, textRows: [],
  };
  return { doc, key: 'p:a', id: 'x' };
}

describe('copying and pasting cards on a map', () => {
  it('pastes a copy in a new column right after the card, with its tags, note, kind and style', () => {
    const { doc, key } = map();
    const clip = clipFromMap(doc, key)!;
    const { doc: next, activityId } = pasteOnMap(doc, clip, key);
    expect(next.steps[0].slots).toHaveLength(2);
    const newKey = ops.activityKeyOf(next, activityId!)!;
    expect(newKey).toBe(`p:${next.steps[0].slots[1]}`);
    expect(next.activities[newKey]).toEqual({ id: activityId, text: 'Remplit le formulaire', tags: ['Irritant'], note: 'Trop long', kind: 'choice' });
    expect(activityId).not.toBe('x');
    expect(next.styles[`act:${activityId}`]).toEqual({ bg: '#FFEEEE' });
    // The copy's tags share the original's arrays with nobody.
    expect(next.activities[newKey].tags).not.toBe(doc.activities[key].tags);
  });

  it('fills an empty card rather than adding one next to it, unless duplicating', () => {
    const { doc, key } = map();
    const clip = clipFromMap(doc, key)!;
    const empty = ops.createActivity(doc, 'q', 'b');
    const filled = pasteOnMap(empty.doc, clip, 'q:b');
    expect(filled.activityId).toBe(empty.activityId);
    expect(filled.doc.activities['q:b'].text).toBe('Remplit le formulaire');
    expect(filled.doc.steps[1].slots).toEqual(['b']);
    const dup = pasteOnMap(empty.doc, clipFromMap(empty.doc, 'q:b')!, 'q:b', false);
    expect(dup.doc.steps[1].slots).toHaveLength(2);
  });

  it('pastes in an empty cell, and leaves an alternative’s joiner behind', () => {
    const { doc, key } = map();
    const alt = ops.addAlternative(doc, key);
    const withJoiner = ops.setJoiner(alt.doc, ops.altKey(key), 'sinon');
    const clip = clipFromMap(withJoiner, ops.altKey(key))!;
    expect('joiner' in clip.card).toBe(false);
    const r = pasteInCell(withJoiner, clip, 'q', 'b');
    expect(r.doc.activities['q:b'].id).toBe(r.activityId);
    expect(r.doc.activities['q:b'].joiner).toBeUndefined();
  });

  it('pastes into another map, bringing the tag colours it lacks without changing its own', () => {
    const { doc, key } = map();
    const clip = clipFromMap(doc, key)!;
    expect(clip.tagColors).toEqual({ irritant: 3 });
    const other = { ...map().doc, activities: { 'q:b': { id: 'y', text: 'Autre' } }, tagColors: {}, styles: {} };
    const r = pasteOnMap(other, clip, 'q:b');
    expect(r.doc.tagColors).toEqual({ irritant: 3 });
    const coloured = pasteOnMap({ ...other, tagColors: { irritant: 5 } }, clip, 'q:b');
    expect(coloured.doc.tagColors).toEqual({ irritant: 5 });
  });
});

describe('copying and pasting cards in a flow', () => {
  it('pastes a copy to the right of the card, joined by an arrow', () => {
    const flow = fo.templateFlow('blank', labels);
    const [start] = flow.nodes;
    const withText = fo.addNode(flow, start.id, 'down');
    const source = fo.setNodeStyle(fo.setNode(withText.flow, withText.nodeId!, { text: 'Ouvre l’app' }), withText.nodeId!, { bg: '#EEF' });
    const clip = clipFromFlow(source, withText.nodeId!)!;
    const r = pasteInFlow(source, clip, withText.nodeId!, () => true);
    const node = fo.findNode(r.flow, r.nodeId!)!;
    expect(node.text).toBe('Ouvre l’app');
    expect(r.flow.links.some((l) => l.from === withText.nodeId && l.to === r.nodeId)).toBe(true);
    expect(r.flow.styles[`node:${r.nodeId}`]).toEqual({ bg: '#EEF' });
  });

  it('with no card selected, pastes at the end of the flow, joined to nothing', () => {
    const flow = fo.templateFlow('blank', labels);
    const clip = clipFromFlow(flow, flow.nodes[0].id)!;
    const r = pasteInFlow(flow, clip, null, () => true);
    const node = fo.findNode(r.flow, r.nodeId!)!;
    expect([node.kind, node.col, node.row]).toEqual(['start', 2, 0]);
    expect(r.flow.links).toEqual(flow.links);
  });

  it('turns a map card into a flow card with its persona, and a flow’s start into a map activity', () => {
    const { doc, key } = map();
    const flow = fo.templateFlow('blank', labels);
    const toFlow = pasteInFlow(flow, clipFromMap(doc, key)!, flow.nodes[0].id, (id) => id === 'p');
    expect(fo.findNode(toFlow.flow, toFlow.nodeId!)).toMatchObject({ kind: 'choice', text: 'Remplit le formulaire', tags: ['Irritant'], note: 'Trop long' });
    expect(fo.findNode(toFlow.flow, toFlow.nodeId!)!.personaIds).toEqual(['p']);
    const unknown = pasteInFlow(flow, clipFromMap(doc, key)!, null, () => false);
    expect(fo.findNode(unknown.flow, unknown.nodeId!)!.personaIds).toBeUndefined();
    const toMap = pasteOnMap(doc, clipFromFlow(flow, flow.nodes[0].id)!, key);
    expect(toMap.doc.activities[ops.activityKeyOf(toMap.doc, toMap.activityId!)!]).toEqual({ id: toMap.activityId, text: 'Début' });
  });
});
