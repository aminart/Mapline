// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import * as ops from './ops';
import { blockFromFlow, blockFromMap, columnsFromPhases, columnsFromSteps, pasteBlockInFlow, pasteBlockOnMap, pasteColumns } from './blocks';
import type { Blueprint, Flow } from './types';

/**
 * Two personas, two phases: "Avant" (step s1, columns a and a2) and
 * "Pendant" (step s2, column b). Cards: p:a, q:a2, p:b with an arrow p:a → q:a2.
 */
function map(): Blueprint {
  return {
    objective: '',
    phases: [{ id: 'f1', title: 'Avant', span: 1 }, { id: 'f2', title: 'Pendant', span: 1 }],
    personas: [{ id: 'p', name: 'Léa', role: '', color: 0 }, { id: 'q', name: 'Tom', role: '', color: 1 }],
    steps: [{ id: 's1', title: 'Découvre', slots: ['a', 'a2'] }, { id: 's2', title: 'Commande', slots: ['b'] }],
    activities: {
      'p:a': { id: 'x', text: 'Lit la pub', tags: ['Irritant'] },
      'q:a2': { id: 'y', text: 'Répond' },
      'p:b': { id: 'z', text: 'Paie' },
    },
    scenes: { s1: { img: null, text: 'Scène 1' } },
    links: [{ id: 'l', from: 'x', to: 'y' }],
    dividers: [],
    tagColors: { irritant: 3 },
    styles: { 'act:x': { bg: '#FFEEEE' }, 'step:s1': { bc: '#123456' }, 'phase:f1': { bg: '#EEEEFF' } },
    storyboard: true,
    textRows: [{ id: 'r', cells: { s1: 'Note 1', s2: 'Note 2' } }],
  };
}

const texts = (doc: Blueprint, personaId: string) =>
  ops.columns(doc).map((c) => doc.activities[`${personaId}:${c.slotId}`]?.text ?? '');

describe('groups of cards', () => {
  it('pastes cards keeping their shape and the arrows between them, in new columns after the target', () => {
    const doc = map();
    const block = blockFromMap(doc, ['p:a', 'q:a2'])!;
    expect(block.cards.map((c) => [c.row, c.col])).toEqual([[0, 0], [1, 1]]);
    const { doc: next, activityIds } = pasteBlockOnMap(doc, block, { personaId: 'p', slotId: 'b' });
    expect(activityIds).toHaveLength(2);
    expect(next.steps[1].slots).toHaveLength(3);
    expect(texts(next, 'p')).toEqual(['Lit la pub', '', 'Paie', 'Lit la pub', '']);
    expect(texts(next, 'q')).toEqual(['', 'Répond', '', '', 'Répond']);
    const [nx, ny] = activityIds;
    expect(next.links.some((l) => l.from === nx && l.to === ny)).toBe(true);
    expect(next.links).toHaveLength(2);
    expect(next.styles[`act:${nx}`]).toEqual({ bg: '#FFEEEE' });
  });

  it('starts in an empty cell’s own column when the cells it needs there are free', () => {
    const doc = map();
    const block = blockFromMap(doc, ['p:a', 'p:b'])!;
    const { doc: next } = pasteBlockOnMap(doc, block, { personaId: 'q', slotId: 'a', fill: true });
    expect(texts(next, 'q')).toEqual(['Lit la pub', 'Paie', 'Répond', '']);
  });

  it('stacks rows past the last persona as alternatives in the last one', () => {
    const doc = map();
    const block = blockFromMap(doc, ['p:a', 'q:a2'])!;
    const { doc: next } = pasteBlockOnMap(doc, block, { personaId: 'q', slotId: 'b' });
    expect(texts(next, 'q').slice(3)).toEqual(['Lit la pub', 'Répond']);
  });

  it('pastes map cards in a flow at the end, one row per persona, with their arrows', () => {
    const doc = map();
    const block = blockFromMap(doc, ['p:a', 'q:a2', 'p:b'])!;
    const flow: Flow = { nodes: [{ id: 'n', kind: 'start', col: 0, row: 0, text: 'Début' }], links: [], styles: {} };
    const { flow: next, nodeIds } = pasteBlockInFlow(flow, block, null, () => true);
    const placed = nodeIds.map((id) => next.nodes.find((n) => n.id === id)!);
    expect(placed.map((n) => [n.text, n.col, n.row])).toEqual([['Lit la pub', 1, 0], ['Répond', 2, 1], ['Paie', 3, 0]]);
    expect(placed[0].personaIds).toEqual(['p']);
    expect(next.links).toHaveLength(1);
    expect(next.tagColors).toEqual({ irritant: 3 });
  });

  it('copies flow cards with their places and arrows', () => {
    const flow: Flow = {
      nodes: [
        { id: 'a', kind: 'activity', col: 2, row: 1, text: 'A' },
        { id: 'b', kind: 'activity', col: 3, row: 2, text: 'B' },
      ],
      links: [{ id: 'l', from: 'a', to: 'b' }],
      styles: {},
    };
    const block = blockFromFlow(flow, ['a', 'b'])!;
    const { flow: next, nodeIds } = pasteBlockInFlow(flow, block, 'a', () => true);
    expect(nodeIds.map((id) => next.nodes.find((n) => n.id === id)).map((n) => [n!.col, n!.row])).toEqual([[4, 1], [5, 2]]);
    expect(next.links).toHaveLength(2);
  });
});

describe('steps and phases', () => {
  it('pastes steps after a step, with their cards, scene, row texts and styles, in that step’s phase', () => {
    const doc = map();
    const block = columnsFromSteps(doc, ['s1'])!;
    const { doc: next, stepIds } = pasteColumns(doc, block, 1);
    expect(next.steps.map((s) => s.title)).toEqual(['Découvre', 'Découvre', 'Commande']);
    expect(next.phases.map((p) => p.span)).toEqual([2, 1]);
    const [id] = stepIds;
    expect(next.scenes[id]).toEqual({ img: null, text: 'Scène 1' });
    expect(next.textRows[0].cells[id]).toBe('Note 1');
    expect(next.styles[`step:${id}`]).toEqual({ bc: '#123456' });
    expect(texts(next, 'p')).toEqual(['Lit la pub', '', 'Lit la pub', '', 'Paie']);
    expect(texts(next, 'q')).toEqual(['', 'Répond', '', 'Répond', '']);
    expect(next.links).toHaveLength(2);
    // New ids everywhere.
    expect(new Set(Object.values(next.activities).map((a) => a.id)).size).toBe(5);
    expect(next.steps[1].slots.some((s) => doc.steps[0].slots.includes(s))).toBe(false);
  });

  it('pastes phases with their steps before phase `at`', () => {
    const doc = map();
    const block = columnsFromPhases(doc, ['f1'])!;
    const { doc: next, phaseIds } = pasteColumns(doc, block, 2);
    expect(next.phases.map((p) => p.title)).toEqual(['Avant', 'Pendant', 'Avant']);
    expect(next.steps.map((s) => s.title)).toEqual(['Découvre', 'Commande', 'Découvre']);
    expect(next.styles[`phase:${phaseIds[0]}`]).toEqual({ bg: '#EEEEFF' });
  });

  it('puts cards on the other map’s personas in order when it doesn’t have the same ones', () => {
    const doc = map();
    const block = columnsFromSteps(doc, ['s1'])!;
    const other: Blueprint = { ...map(), personas: [{ id: 'u', name: 'Ana', role: '', color: 0 }], activities: {}, links: [], textRows: [] };
    const { doc: next } = pasteColumns(other, block, 2);
    expect(texts(next, 'u')).toEqual(['', '', '', 'Lit la pub', '']);
    // Tom's card has no row to go to.
    expect(Object.values(next.activities).map((a) => a.text)).toEqual(['Lit la pub']);
    expect(next.links).toEqual([]);
  });
});
