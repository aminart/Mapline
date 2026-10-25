// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Flow, FlowLink, FlowNode, FlowNodeKind, Id, LinkStyle } from './types';
import { uid, withTag } from './ops';

export type Direction = 'up' | 'right' | 'down' | 'left';

export function nodeAt(flow: Flow, col: number, row: number): FlowNode | undefined {
  return flow.nodes.find((n) => n.col === col && n.row === row);
}

export function findNode(flow: Flow, id: Id): FlowNode | undefined {
  return flow.nodes.find((n) => n.id === id);
}

/** Columns and rows the flow spans (at least one of each). */
export function extent(flow: Flow): { cols: number; rows: number } {
  return {
    cols: Math.max(1, ...flow.nodes.map((n) => n.col + 1)),
    rows: Math.max(1, ...flow.nodes.map((n) => n.row + 1)),
  };
}

/** Makes room: every card from column `at` on moves one column right. */
export function insertColumn(flow: Flow, at: number): Flow {
  return { ...flow, nodes: flow.nodes.map((n) => (n.col >= at ? { ...n, col: n.col + 1 } : n)) };
}

/** Makes room: every card from row `at` down moves one row down. */
export function insertRow(flow: Flow, at: number): Flow {
  return { ...flow, nodes: flow.nodes.map((n) => (n.row >= at ? { ...n, row: n.row + 1 } : n)) };
}

/** Removes empty columns and rows, so the flow stays tight against the top left. */
export function compact(flow: Flow): Flow {
  const cols = [...new Set(flow.nodes.map((n) => n.col))].sort((a, b) => a - b);
  const rows = [...new Set(flow.nodes.map((n) => n.row))].sort((a, b) => a - b);
  const col = new Map(cols.map((c, i) => [c, i]));
  const row = new Map(rows.map((r, i) => [r, i]));
  if (cols.every((c, i) => c === i) && rows.every((r, i) => r === i)) return flow;
  return { ...flow, nodes: flow.nodes.map((n) => ({ ...n, col: col.get(n.col)!, row: row.get(n.row)! })) };
}

function newNode(kind: FlowNodeKind, col: number, row: number, text = ''): FlowNode {
  return { id: uid(), kind, col, row, text };
}

function link(from: Id, to: Id, label?: string): FlowLink {
  return label ? { id: uid(), from, to, label } : { id: uid(), from, to };
}

/**
 * Adds a card next to `fromId`, in direction `dir`, joined by an arrow from
 * it. When that cell is taken (or off the grid), a column or row is inserted
 * so the rest of the flow moves along; if the card pushed away was the next
 * one after `fromId`, the new card goes in between.
 */
export function addNode(flow: Flow, fromId: Id, dir: Direction, kind: FlowNodeKind = 'activity', label?: string): { flow: Flow; nodeId: Id | null } {
  const from = findNode(flow, fromId);
  if (!from) return { flow, nodeId: null };
  let next = flow;
  let col = from.col;
  let row = from.row;
  const neighbour = dir === 'right' ? nodeAt(flow, from.col + 1, from.row) : dir === 'down' ? nodeAt(flow, from.col, from.row + 1) : dir === 'left' ? nodeAt(flow, from.col - 1, from.row) : nodeAt(flow, from.col, from.row - 1);
  const pushed = neighbour ? flow.links.find((l) => l.from === fromId && l.to === neighbour.id) : undefined;
  if (dir === 'right') {
    col = from.col + 1;
    if (nodeAt(next, col, row)) next = insertColumn(next, col);
  } else if (dir === 'down') {
    row = from.row + 1;
    if (nodeAt(next, col, row)) next = insertRow(next, row);
  } else if (dir === 'left') {
    if (from.col === 0 || nodeAt(next, from.col - 1, row)) next = insertColumn(next, from.col);
    else col = from.col - 1;
  } else {
    if (from.row === 0 || nodeAt(next, col, from.row - 1)) next = insertRow(next, from.row);
    else row = from.row - 1;
  }
  const node = newNode(kind, col, row);
  let links = next.links.concat([link(fromId, node.id, label ?? pushed?.label)]);
  if (pushed) {
    // In between: from → new → the card that was next.
    const onward: FlowLink = { ...pushed, id: uid(), from: node.id };
    delete onward.label;
    links = links.filter((l) => l.id !== pushed.id).concat([onward]);
  }
  return { flow: { ...next, nodes: next.nodes.concat([node]), links }, nodeId: node.id };
}

/**
 * Puts a new card on an arrow, between its two cards: right after the
 * first one, the rest of the row moving along when needed.
 */
export function insertOnLink(flow: Flow, linkId: Id, kind: FlowNodeKind = 'activity'): { flow: Flow; nodeId: Id | null } {
  const l = flow.links.find((x) => x.id === linkId);
  if (!l || !findNode(flow, l.from) || !findNode(flow, l.to)) return { flow, nodeId: null };
  const without = { ...flow, links: flow.links.filter((x) => x.id !== linkId) };
  const r = addNode(without, l.from, 'right', kind, l.label);
  if (!r.nodeId) return { flow, nodeId: null };
  const back = { ...l, id: uid(), from: r.nodeId };
  delete back.label;
  return { flow: { ...r.flow, links: r.flow.links.concat([back]) }, nodeId: r.nodeId };
}

/**
 * Removes a card and its arrows. A card in the middle of a straight run
 * (one arrow in, one out) leaves the run joined; empty columns and rows
 * close up.
 */
export function removeNode(flow: Flow, id: Id): Flow {
  if (!findNode(flow, id)) return flow;
  const incoming = flow.links.filter((l) => l.to === id && l.from !== id);
  const outgoing = flow.links.filter((l) => l.from === id && l.to !== id);
  let links = flow.links.filter((l) => l.from !== id && l.to !== id);
  if (incoming.length === 1 && outgoing.length === 1) {
    const [a, b] = [incoming[0].from, outgoing[0].to];
    if (a !== b && !links.some((l) => l.from === a && l.to === b)) links = links.concat([{ ...incoming[0], id: uid(), to: b }]);
  }
  return compact({ ...flow, nodes: flow.nodes.filter((n) => n.id !== id), links, styles: dropStyle(flow.styles, id) });
}

function dropStyle(styles: Flow['styles'], id: Id): Flow['styles'] {
  const { [`node:${id}`]: _removed, ...rest } = styles;
  return rest;
}

/** Moves a card to a cell, swapping with the card there. */
export function moveNode(flow: Flow, id: Id, col: number, row: number): Flow {
  const node = findNode(flow, id);
  if (!node || col < 0 || row < 0 || (node.col === col && node.row === row)) return flow;
  const other = nodeAt(flow, col, row);
  return compact({
    ...flow,
    nodes: flow.nodes.map((n) => (n.id === id ? { ...n, col, row } : other && n.id === other.id ? { ...n, col: node.col, row: node.row } : n)),
  });
}

/** Adds an arrow from → to, or removes it if it already exists. */
export function toggleFlowLink(flow: Flow, from: Id, to: Id): Flow {
  if (from === to || !findNode(flow, from) || !findNode(flow, to)) return flow;
  const existing = flow.links.find((l) => l.from === from && l.to === to);
  if (existing) return { ...flow, links: flow.links.filter((l) => l.id !== existing.id) };
  return { ...flow, links: flow.links.concat([link(from, to)]) };
}

export function removeFlowLink(flow: Flow, id: Id): Flow {
  return { ...flow, links: flow.links.filter((l) => l.id !== id) };
}

export function updateFlowLink(flow: Flow, id: Id, patch: Partial<Pick<FlowLink, 'label' | 'style' | 'color'>> & { style?: LinkStyle }): Flow {
  return { ...flow, links: flow.links.map((l) => (l.id === id ? { ...l, ...patch } : l)) };
}

export function setNode(flow: Flow, id: Id, patch: Partial<Pick<FlowNode, 'text' | 'kind' | 'personaId'>>): Flow {
  return { ...flow, nodes: flow.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) };
}

export function addNodeTag(flow: Flow, id: Id, tag: string): Flow {
  const node = findNode(flow, id);
  const tags = node ? withTag(node.tags ?? [], tag) : null;
  if (!node || !tags) return flow;
  return { ...flow, nodes: flow.nodes.map((n) => (n.id === id ? { ...n, tags } : n)) };
}

export function removeNodeTag(flow: Flow, id: Id, tag: string): Flow {
  return { ...flow, nodes: flow.nodes.map((n) => (n.id === id && n.tags?.includes(tag) ? { ...n, tags: n.tags.filter((x) => x !== tag) } : n)) };
}

export function setNodeNote(flow: Flow, id: Id, note: string): Flow {
  return {
    ...flow,
    nodes: flow.nodes.map((n) => {
      if (n.id !== id) return n;
      const { note: _old, ...rest } = n;
      return note.trim() ? { ...rest, note } : rest;
    }),
  };
}

/** How many cards carry each tag (keyed by the tag as first written). */
export function flowTagCounts(flow: Flow): { tag: string; count: number }[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const n of flow.nodes) {
    for (const tag of n.tags ?? []) {
      const entry = counts.get(tag.toLowerCase()) ?? { tag, count: 0 };
      entry.count++;
      counts.set(tag.toLowerCase(), entry);
    }
  }
  return [...counts.values()].sort((a, b) => a.tag.localeCompare(b.tag));
}

export function setFlowTagColor(flow: Flow, tag: string, color: number): Flow {
  return { ...flow, tagColors: { ...flow.tagColors, [tag.toLowerCase()]: color } };
}

/** Removes a tag from every card. */
export function deleteFlowTag(flow: Flow, tag: string): Flow {
  const key = tag.toLowerCase();
  const tagColors = { ...flow.tagColors };
  delete tagColors[key];
  return {
    ...flow,
    tagColors,
    nodes: flow.nodes.map((n) => (n.tags?.some((x) => x.toLowerCase() === key) ? { ...n, tags: n.tags.filter((x) => x.toLowerCase() !== key) } : n)),
  };
}

export function setNodeStyle(flow: Flow, id: Id, patch: Flow['styles'][string]): Flow {
  const key = `node:${id}`;
  return { ...flow, styles: { ...flow.styles, [key]: { ...flow.styles[key], ...patch } } };
}

export function resetNodeStyle(flow: Flow, id: Id): Flow {
  return { ...flow, styles: dropStyle(flow.styles, id) };
}

/** The flow templates: a user flow to complete, or just a start and an end. */
export function templateFlow(id: 'user' | 'blank', labels: { start: string; end: string; yes: string; no: string }): Flow {
  const start = newNode('start', 0, id === 'user' ? 1 : 0, labels.start);
  if (id === 'blank') {
    const end = newNode('end', 1, 0, labels.end);
    return { nodes: [start, end], links: [link(start.id, end.id)], styles: {} };
  }
  const act = newNode('activity', 1, 1);
  const choice = newNode('choice', 2, 1);
  const yes = newNode('activity', 3, 0);
  const no = newNode('activity', 3, 2);
  const merge = newNode('activity', 4, 1);
  const end = newNode('end', 5, 1, labels.end);
  return {
    nodes: [start, act, choice, yes, no, merge, end],
    links: [
      link(start.id, act.id),
      link(act.id, choice.id),
      link(choice.id, yes.id, labels.yes),
      link(choice.id, no.id, labels.no),
      link(yes.id, merge.id),
      link(no.id, merge.id),
      link(merge.id, end.id),
    ],
    styles: {},
  };
}
