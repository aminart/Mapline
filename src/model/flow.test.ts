// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import * as fo from './flow';
import { nodeBox } from './flowLayout';
import { routeFlow } from '../lib/flowRoute';
import type { Flow, FlowNode } from './types';

const labels = { start: 'Début', end: 'Fin', yes: 'Oui', no: 'Non' };
const at = (flow: Flow, id: string | null) => {
  const n = fo.findNode(flow, id!)!;
  return [n.col, n.row];
};

describe('flow templates', () => {
  it('builds a user flow with a choice and two branches that meet again', () => {
    const flow = fo.templateFlow('user', labels);
    expect(flow.nodes.map((n) => n.kind)).toEqual(['start', 'activity', 'choice', 'activity', 'activity', 'activity', 'end']);
    expect(flow.links.filter((l) => l.label).map((l) => l.label)).toEqual(['Oui', 'Non']);
    expect(fo.extent(flow)).toEqual({ cols: 6, rows: 3 });
  });

  it('builds a blank flow: a start joined to an end', () => {
    const flow = fo.templateFlow('blank', labels);
    expect(flow.nodes.map((n) => [n.kind, n.text])).toEqual([['start', 'Début'], ['end', 'Fin']]);
    expect(flow.links).toHaveLength(1);
  });
});

describe('adding cards', () => {
  it('adds to the right, moving the rest of the flow along when the cell is taken', () => {
    const flow = fo.templateFlow('blank', labels);
    const [start, end] = flow.nodes;
    const r = fo.addNode(flow, start.id, 'right');
    expect(at(r.flow, r.nodeId)).toEqual([1, 0]);
    expect(at(r.flow, end.id)).toEqual([2, 0]);
    expect(r.flow.links.some((l) => l.from === start.id && l.to === r.nodeId)).toBe(true);
    // The end was next after the start: the new card goes in between.
    expect(r.flow.links.map((l) => [l.from, l.to])).toEqual([[start.id, r.nodeId], [r.nodeId, end.id]]);
  });

  it('branches off when the cell beside is free or holds an unrelated card', () => {
    const flow = fo.templateFlow('user', labels);
    const merge = flow.nodes[5];
    const r = fo.addNode(flow, merge.id, 'down');
    expect(r.flow.links.filter((l) => l.from === merge.id)).toHaveLength(2);
  });

  it('adds above, below and to the left, inserting rows and columns as needed', () => {
    let flow = fo.templateFlow('blank', labels);
    const [start, end] = flow.nodes;
    // Below the end: a free cell.
    let r = fo.addNode(flow, end.id, 'down');
    expect(at(r.flow, r.nodeId)).toEqual([1, 1]);
    flow = r.flow;
    const below = r.nodeId!;
    // Above the end: off the grid, so a row is inserted and everything moves down.
    r = fo.addNode(flow, end.id, 'up');
    expect(at(r.flow, r.nodeId)).toEqual([1, 0]);
    expect(at(r.flow, end.id)).toEqual([1, 1]);
    expect(at(r.flow, below)).toEqual([1, 2]);
    expect(at(r.flow, start.id)).toEqual([0, 1]);
    flow = r.flow;
    // Left of the start: off the grid, so a column is inserted.
    r = fo.addNode(flow, start.id, 'left', 'choice');
    expect(at(r.flow, r.nodeId)).toEqual([0, 1]);
    expect(at(r.flow, start.id)).toEqual([1, 1]);
    expect(fo.findNode(r.flow, r.nodeId!)!.kind).toBe('choice');
    // Below the end again: taken, so a row is inserted under the end.
    r = fo.addNode(r.flow, end.id, 'down');
    expect(at(r.flow, r.nodeId)).toEqual([2, 2]);
    expect(at(r.flow, below)).toEqual([2, 3]);
  });

  it('puts a card on an arrow, keeping the label on the first half', () => {
    const flow = fo.templateFlow('user', labels);
    const yes = flow.links.find((l) => l.label === 'Oui')!;
    const r = fo.insertOnLink(flow, yes.id);
    const into = r.flow.links.find((l) => l.to === r.nodeId)!;
    const outOf = r.flow.links.find((l) => l.from === r.nodeId)!;
    expect(into).toMatchObject({ from: yes.from, label: 'Oui' });
    expect(outOf.to).toBe(yes.to);
    expect(outOf.label).toBeUndefined();
    expect(r.flow.links.some((l) => l.id === yes.id)).toBe(false);
  });
});

describe('removing and moving cards', () => {
  it('keeps a straight run joined and closes up the empty column', () => {
    const flow = fo.templateFlow('blank', labels);
    const [start, end] = flow.nodes;
    const r = fo.addNode(flow, start.id, 'right');
    const removed = fo.removeNode(r.flow, r.nodeId!);
    expect(removed.links.map((l) => [l.from, l.to])).toEqual([[start.id, end.id]]);
    expect(at(removed, end.id)).toEqual([1, 0]);
  });

  it('removes a choice and its branches’ arrows, without guessing how to rejoin', () => {
    const flow = fo.templateFlow('user', labels);
    const choice = flow.nodes.find((n) => n.kind === 'choice')!;
    const removed = fo.removeNode(flow, choice.id);
    expect(removed.links.some((l) => l.from === choice.id || l.to === choice.id)).toBe(false);
    expect(removed.links).toHaveLength(flow.links.length - 3);
  });

  it('moves a card to another cell, swapping with the card there', () => {
    const flow = fo.templateFlow('blank', labels);
    const [start, end] = flow.nodes;
    const moved = fo.moveNode(flow, start.id, 1, 0);
    expect([at(moved, start.id), at(moved, end.id)]).toEqual([[1, 0], [0, 0]]);
  });

  it('links and unlinks two cards, never a card to itself', () => {
    const flow = fo.templateFlow('blank', labels);
    const [start, end] = flow.nodes;
    const back = fo.toggleFlowLink(flow, end.id, start.id);
    expect(back.links).toHaveLength(2);
    expect(fo.toggleFlowLink(back, end.id, start.id).links).toHaveLength(1);
    expect(fo.toggleFlowLink(flow, start.id, start.id)).toBe(flow);
  });
});

/** Does the polyline go through the inside of `box`? */
function crosses(points: [number, number][], box: { x: number; y: number; w: number; h: number }): boolean {
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    if (Math.max(x1, x2) > box.x + 1 && Math.min(x1, x2) < box.x + box.w - 1 && Math.max(y1, y2) > box.y + 1 && Math.min(y1, y2) < box.y + box.h - 1) return true;
  }
  return false;
}

const onEdge = ([x, y]: [number, number], b: { x: number; y: number; w: number; h: number }) =>
  x >= b.x - 0.5 && x <= b.x + b.w + 0.5 && y >= b.y - 0.5 && y <= b.y + b.h + 0.5 &&
  (Math.abs(x - b.x) < 0.5 || Math.abs(x - b.x - b.w) < 0.5 || Math.abs(y - b.y) < 0.5 || Math.abs(y - b.y - b.h) < 0.5);

describe('arrow routes', () => {
  it('never cross a card, in every direction, loops included', () => {
    // A 4 × 4 grid with holes, and an arrow between every pair of cards.
    const kinds = ['activity', 'choice', 'start', 'end'] as const;
    const nodes: FlowNode[] = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if ((c * 7 + r * 3) % 5 !== 0) nodes.push({ id: `${c}-${r}`, kind: kinds[(c + r) % 4], col: c, row: r, text: '' });
    const links = nodes.flatMap((a) => nodes.filter((b) => b !== a).map((b) => ({ id: `${a.id}>${b.id}`, from: a.id, to: b.id })));
    const routed = routeFlow({ nodes, links, styles: {} });
    expect(routed).toHaveLength(links.length);
    for (const { link, points } of routed) {
      for (const n of nodes) {
        const box = nodeBox(n);
        expect(crosses(points, box), `${link.id} crosses ${n.id}: ${JSON.stringify(points)}`).toBe(false);
      }
      const a = nodes.find((n) => n.id === link.from)!;
      const b = nodes.find((n) => n.id === link.to)!;
      expect(onEdge(points[0], nodeBox(a)), `${link.id} starts off its card`).toBe(true);
      expect(onEdge(points[points.length - 1], nodeBox(b)), `${link.id} ends off its card`).toBe(true);
      // Orthogonal: every segment is horizontal or vertical.
      for (let i = 1; i < points.length; i++) expect(points[i][0] === points[i - 1][0] || points[i][1] === points[i - 1][1]).toBe(true);
    }
  });

  it('goes straight to the next card, and loops back over the row', () => {
    const flow = fo.templateFlow('blank', labels);
    const [start, end] = flow.nodes;
    const withBack = fo.toggleFlowLink(flow, end.id, start.id);
    const [forward, back] = routeFlow(withBack);
    expect(forward.points).toHaveLength(2);
    expect(back.points[0][1]).toBe(nodeBox(end).y);
    expect(Math.min(...back.points.map((p) => p[1]))).toBeLessThan(nodeBox(end).y);
  });
});

describe('flows in project files', () => {
  it('round-trip, and drop what a damaged file gets wrong', async () => {
    const { parse, serialize } = await import('./serialize');
    const { createFlowProject } = await import('./templates');
    const project = createFlowProject('user', 'fr');
    expect(parse(serialize(project))).toEqual(project);
    const flowDoc = project.docs[0];
    if (flowDoc.kind !== 'flow') throw new Error('not a flow');
    const [a, b] = flowDoc.flow.nodes;
    const damaged = {
      ...project,
      docs: [{ ...flowDoc, flow: { nodes: [a, { ...b, col: a.col, row: a.row }], links: [{ id: 'x', from: a.id, to: 'missing' }], styles: {} } }],
    };
    const back = parse(JSON.stringify(damaged)).docs[0];
    if (back.kind !== 'flow') throw new Error('not a flow');
    expect(back.flow.nodes.map((n) => n.id)).toEqual([a.id]);
    expect(back.flow.links).toEqual([]);
  });
});
