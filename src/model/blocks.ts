// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Activity, Blueprint, BoxStyle, Flow, FlowNode, Id, Link, Phase, Scene, Step } from './types';
import { activityKey, altKey, cellCardKeys, cellKey, columns, normalizePhases, phaseIndexOf, uid } from './ops';
import { extent, findNode } from './flow';
import { clipFromFlow, clipFromMap, type CardClip } from './clipboard';

/**
 * Several things copied together, from a multiple selection: cards that keep
 * their layout, or whole steps or phases with everything under them.
 */

/** One card of a copied group, with its place in the group. */
export interface BlockCard {
  clip: CardClip;
  /** Its id where it was copied, to carry the arrows between the cards. */
  srcId: Id;
  /** Persona row (map) or row (flow), counted from the group's top. */
  row: number;
  /** Column, counted from the group's left. */
  col: number;
  /** On a map: its place among the copied cards of its cell, from 0. */
  alt: number;
}

/** Cards copied together. */
export interface CardBlock {
  kind: 'cards';
  from: 'map' | 'flow';
  cards: BlockCard[];
  /** The arrows between them, by their `srcId`. */
  links: Link[];
}

/** Steps (or phases with their steps) copied with their cards, scenes, texts and styles. */
export interface ColumnsBlock {
  kind: 'columns';
  /** Set when whole phases were copied; their spans add up to the steps. */
  phases?: Phase[];
  steps: Step[];
  /** The source map's personas, in order, to find their rows again. */
  personas: Id[];
  /** The cards of these steps, keyed as on the map. */
  activities: Record<string, Activity>;
  scenes: Record<Id, Scene>;
  /** The free text rows' cells under these steps, row by row. */
  textRows: { id: Id; cells: Record<Id, string> }[];
  /** Styles of the steps, scenes, cards (and phases). */
  styles: Record<string, BoxStyle>;
  links: Link[];
  tagColors: Record<string, number>;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** `into` with the colours of `add` it doesn't have yet. */
function withColors(into: Record<string, number> | undefined, add: Record<string, number>): Record<string, number> {
  const out = { ...into };
  for (const [tag, c] of Object.entries(add)) if (out[tag] === undefined) out[tag] = c;
  return out;
}

/** The arrows of `links` between two of `ids`, renumbered with `ids`' new ids. */
function linksWithin<L extends Link>(links: L[], ids: Map<Id, Id>): L[] {
  return links.filter((l) => ids.has(l.from) && ids.has(l.to)).map((l) => ({ ...clone(l), id: uid(), from: ids.get(l.from)!, to: ids.get(l.to)! }));
}

// Cards

/** The map cards at `keys`, as a group keeping their rows and columns (empty columns between them left out). */
export function blockFromMap(map: Blueprint, keys: string[]): CardBlock | null {
  const cols = columns(map).map((c) => c.slotId);
  const rows = map.personas.map((p) => p.id);
  const found = keys
    .filter((k) => map.activities[k])
    .map((k) => {
      const [personaId, slotId] = k.split(':');
      const cell = cellCardKeys(map.activities, cellKey(k));
      return { key: k, row: rows.indexOf(personaId), col: cols.indexOf(slotId), alt: cell.indexOf(k) };
    })
    .filter((c) => c.row >= 0 && c.col >= 0)
    .sort((a, b) => a.col - b.col || a.row - b.row || a.alt - b.alt);
  if (!found.length) return null;
  const top = Math.min(...found.map((c) => c.row));
  const usedCols = [...new Set(found.map((c) => c.col))];
  const cards: BlockCard[] = [];
  for (const c of found) {
    const clip = clipFromMap(map, c.key);
    if (!clip) continue;
    const row = c.row - top;
    const col = usedCols.indexOf(c.col);
    const alt = cards.filter((o) => o.row === row && o.col === col).length;
    cards.push({ clip, srcId: map.activities[c.key].id, row, col, alt });
  }
  const ids = new Set(cards.map((c) => c.srcId));
  return { kind: 'cards', from: 'map', cards, links: clone(map.links.filter((l) => ids.has(l.from) && ids.has(l.to))) };
}

/** The flow cards `ids`, as a group keeping their places. */
export function blockFromFlow(flow: Flow, ids: Id[]): CardBlock | null {
  const nodes = ids.map((id) => findNode(flow, id)).filter((n): n is FlowNode => !!n);
  if (!nodes.length) return null;
  const top = Math.min(...nodes.map((n) => n.row));
  const left = Math.min(...nodes.map((n) => n.col));
  const cards: BlockCard[] = [];
  for (const n of nodes.sort((a, b) => a.col - b.col || a.row - b.row)) {
    const clip = clipFromFlow(flow, n.id);
    if (clip) cards.push({ clip, srcId: n.id, row: n.row - top, col: n.col - left, alt: 0 });
  }
  const set = new Set(cards.map((c) => c.srcId));
  return { kind: 'cards', from: 'flow', cards, links: clone(flow.links.filter((l) => set.has(l.from) && set.has(l.to))) };
}

/** The copied card as a map activity: a flow's start or end becomes an activity. */
function asActivity(clip: CardClip, id: Id): Activity {
  const c = clip.card;
  const out: Activity = { id, text: c.text };
  if (c.tags?.length) out.tags = [...c.tags];
  if (c.note) out.note = c.note;
  if (c.noteResolved) out.noteResolved = true;
  if (c.kind === 'choice') out.kind = 'choice';
  return out;
}

const blank = (a: Activity) => !a.text.trim() && !a.tags?.length && !a.note?.trim();

/** Where a group of cards goes on a map: its top row on `personaId`, its first column right after `slotId`. */
export interface MapAnchor {
  personaId: Id;
  slotId: Id;
  /**
   * When set, the group may start in the anchor's own column, if the cells it
   * needs there are empty (or hold just the empty card `blankKey`).
   */
  fill?: boolean;
  blankKey?: string;
}

/**
 * Pastes a group of cards on a map. It keeps its shape: its top row lands on
 * the anchor's persona (rows past the last persona stack up in the last
 * one), and its columns are new columns made in the anchor's step, right
 * after the anchor, so nothing already there moves or is covered. Arrows
 * between the cards are copied too.
 */
export function pasteBlockOnMap(map: Blueprint, block: CardBlock, at: MapAnchor): { doc: Blueprint; activityIds: Id[] } {
  const personas = map.personas.map((p) => p.id);
  const anchorRow = personas.indexOf(at.personaId);
  const step = map.steps.find((s) => s.slots.includes(at.slotId));
  if (anchorRow < 0 || !step || !block.cards.length) return { doc: map, activityIds: [] };
  const rowOf = (r: number) => personas[Math.min(personas.length - 1, anchorRow + r)];
  const width = Math.max(...block.cards.map((c) => c.col)) + 1;

  const activities = { ...map.activities };
  // The group's first column may be the anchor's own, when free.
  const freeHere =
    at.fill &&
    block.cards
      .filter((c) => c.col === 0)
      .every((c) => {
        const keys = cellCardKeys(activities, activityKey(rowOf(c.row), at.slotId));
        return keys.length === 0 || (keys.length === 1 && keys[0] === at.blankKey && blank(activities[keys[0]]));
      });
  const slots = step.slots.slice();
  const newSlots: Id[] = [];
  let pos = slots.indexOf(at.slotId) + 1;
  for (let i = freeHere ? 1 : 0; i < width; i++) {
    const id = uid();
    slots.splice(pos++, 0, id);
    newSlots.push(id);
  }
  const slotOf = (col: number) => (freeHere ? (col === 0 ? at.slotId : newSlots[col - 1]) : newSlots[col]);
  if (freeHere && at.blankKey) {
    // The empty card just made gives its place to the copy.
    for (const c of block.cards.filter((b) => b.col === 0)) {
      const key = activityKey(rowOf(c.row), at.slotId);
      if (key === at.blankKey) delete activities[key];
    }
  }

  const styles = { ...map.styles };
  let tagColors = map.tagColors;
  const ids = new Map<Id, Id>();
  for (const c of block.cards) {
    const cell = activityKey(rowOf(c.row), slotOf(c.col));
    const n = cellCardKeys(activities, cell).length;
    const key = n === 0 ? cell : altKey(cell, n);
    const id = uid();
    const card = asActivity(c.clip, id);
    const joiner = c.clip.from === 'map' ? c.clip.card.joiner : undefined;
    if (n > 0 && joiner !== undefined) card.joiner = joiner;
    activities[key] = card;
    if (c.clip.style) styles[`act:${id}`] = { ...c.clip.style };
    tagColors = withColors(tagColors, c.clip.tagColors);
    ids.set(c.srcId, id);
  }
  const removed = at.blankKey && !activities[at.blankKey] ? map.activities[at.blankKey]?.id : undefined;
  const links = (removed ? map.links.filter((l) => l.from !== removed && l.to !== removed) : map.links).concat(linksWithin(block.links, ids));
  return {
    doc: { ...map, steps: map.steps.map((s) => (s.id === step.id ? { ...s, slots } : s)), activities, styles, tagColors, links },
    activityIds: [...ids.values()],
  };
}

/**
 * Pastes a group of cards in a flow, keeping their layout and the arrows
 * between them: in new columns at the end of the flow, its top row on the
 * row of the card `atId` (the first row with none). Map cards keep their
 * persona's colour, when the persona is one of the project's (`known`).
 */
export function pasteBlockInFlow(flow: Flow, block: CardBlock, atId: Id | null, known: (personaId: Id) => boolean): { flow: Flow; nodeIds: Id[] } {
  if (!block.cards.length) return { flow, nodeIds: [] };
  const baseCol = flow.nodes.length ? extent(flow).cols : 0;
  const baseRow = (atId && findNode(flow, atId)?.row) || 0;
  // On a map several cards may share a cell: each one gets a row of its own.
  const rowStart: number[] = [];
  if (block.from === 'map') {
    const rows = Math.max(...block.cards.map((c) => c.row)) + 1;
    for (let r = 0, y = 0; r < rows; r++) {
      rowStart.push(y);
      y += Math.max(0, ...block.cards.filter((c) => c.row === r).map((c) => c.alt + 1)) || 1;
    }
  }
  const nodes: FlowNode[] = [];
  const styles = { ...flow.styles };
  let tagColors = flow.tagColors;
  const ids = new Map<Id, Id>();
  for (const c of block.cards) {
    const id = uid();
    const col = baseCol + c.col;
    const row = baseRow + (block.from === 'map' ? rowStart[c.row] + c.alt : c.row);
    nodes.push(asNode(c.clip, id, col, row, known));
    if (c.clip.style) styles[`node:${id}`] = { ...c.clip.style };
    tagColors = withColors(tagColors, c.clip.tagColors);
    ids.set(c.srcId, id);
  }
  return {
    flow: { ...flow, nodes: flow.nodes.concat(nodes), links: flow.links.concat(linksWithin(block.links, ids)), styles, tagColors },
    nodeIds: [...ids.values()],
  };
}

/** The copied card as a flow card at (col, row). */
function asNode(clip: CardClip, id: Id, col: number, row: number, known: (personaId: Id) => boolean): FlowNode {
  if (clip.from === 'flow') {
    const node: FlowNode = { ...clone(clip.card), id, col, row };
    const kept = node.personaIds?.filter(known);
    if (kept?.length) node.personaIds = kept;
    else delete node.personaIds;
    return node;
  }
  const c = clip.card;
  const node: FlowNode = { id, kind: c.kind === 'choice' ? 'choice' : 'activity', col, row, text: c.text };
  if (known(clip.personaId)) node.personaIds = [clip.personaId];
  if (c.tags?.length) node.tags = [...c.tags];
  if (c.note) node.note = c.note;
  if (c.noteResolved) node.noteResolved = true;
  return node;
}

// Steps and phases

/** The steps `stepIds` of a map (in the map's order), with all that hangs on them. */
export function columnsFromSteps(map: Blueprint, stepIds: Id[]): ColumnsBlock | null {
  const wanted = new Set(stepIds);
  const steps = map.steps.filter((s) => wanted.has(s.id));
  if (!steps.length) return null;
  return gather(map, steps);
}

/** The phases `phaseIds` of a map (in the map's order), with their steps and all that hangs on them. */
export function columnsFromPhases(map: Blueprint, phaseIds: Id[]): ColumnsBlock | null {
  const wanted = new Set(phaseIds);
  const phases = normalizePhases(map.phases, map.steps.length);
  const picked: Phase[] = [];
  const steps: Step[] = [];
  let start = 0;
  for (const p of phases) {
    if (wanted.has(p.id)) {
      picked.push({ ...p });
      steps.push(...map.steps.slice(start, start + p.span));
    }
    start += p.span;
  }
  if (!picked.length) return null;
  const block = gather(map, steps);
  block.phases = picked;
  for (const p of picked) if (map.styles[`phase:${p.id}`]) block.styles[`phase:${p.id}`] = clone(map.styles[`phase:${p.id}`]);
  return block;
}

function gather(map: Blueprint, steps: Step[]): ColumnsBlock {
  const slots = new Set(steps.flatMap((s) => s.slots));
  const stepIds = new Set(steps.map((s) => s.id));
  const activities: Record<string, Activity> = {};
  const styles: Record<string, BoxStyle> = {};
  const tagColors: Record<string, number> = {};
  for (const [key, act] of Object.entries(map.activities)) {
    if (!slots.has(key.split(':')[1])) continue;
    activities[key] = clone(act);
    if (map.styles[`act:${act.id}`]) styles[`act:${act.id}`] = clone(map.styles[`act:${act.id}`]);
    for (const tag of act.tags ?? []) {
      const c = map.tagColors?.[tag.toLowerCase()];
      if (c !== undefined) tagColors[tag.toLowerCase()] = c;
    }
  }
  const scenes: Record<Id, Scene> = {};
  for (const s of steps) {
    if (map.scenes[s.id]) scenes[s.id] = clone(map.scenes[s.id]);
    for (const k of [`step:${s.id}`, `scene:${s.id}`]) if (map.styles[k]) styles[k] = clone(map.styles[k]);
  }
  const ids = new Set(Object.values(activities).map((a) => a.id));
  return {
    kind: 'columns',
    steps: clone(steps),
    personas: map.personas.map((p) => p.id),
    activities,
    scenes,
    textRows: map.textRows.map((r) => ({ id: r.id, cells: Object.fromEntries(Object.entries(r.cells).filter(([id]) => stepIds.has(id))) })),
    styles,
    links: clone(map.links.filter((l) => ids.has(l.from) && ids.has(l.to))),
    tagColors,
  };
}

/**
 * Which of `map`'s personas each copied persona's cards go to: the same
 * persona when the map has it, else the map's other personas in order.
 */
function personaMatch(map: Blueprint, from: Id[]): Map<Id, Id> {
  const here = map.personas.map((p) => p.id);
  const out = new Map<Id, Id>();
  for (const id of from) if (here.includes(id)) out.set(id, id);
  const rest = here.filter((id) => !from.includes(id));
  for (const id of from) if (!out.has(id) && rest.length) out.set(id, rest.shift()!);
  return out;
}

/**
 * Pastes copied steps (or phases) into a map, as new ones with new ids.
 * Steps go before step `at` and join the phase of the step before them;
 * phases go before phase `at`. Cards follow their persona when this map has
 * it, else the map's other rows in order; text rows likewise.
 */
export function pasteColumns(map: Blueprint, block: ColumnsBlock, at: number): { doc: Blueprint; stepIds: Id[]; phaseIds: Id[] } {
  const phases = normalizePhases(map.phases, map.steps.length);
  const stepIdMap = new Map<Id, Id>();
  const slotMap = new Map<Id, Id>();
  const newSteps: Step[] = block.steps.map((s) => {
    const id = uid();
    stepIdMap.set(s.id, id);
    return {
      ...s,
      id,
      slots: s.slots.map((sl) => {
        const n = uid();
        slotMap.set(sl, n);
        return n;
      }),
    };
  });

  const personas = personaMatch(map, block.personas);
  const activities = { ...map.activities };
  const styles = { ...map.styles };
  const actIds = new Map<Id, Id>();
  for (const [key, act] of Object.entries(block.activities)) {
    const [personaId, slotId, ...rest] = key.split(':');
    const p = personas.get(personaId);
    const sl = slotMap.get(slotId);
    if (!p || !sl) continue;
    const id = uid();
    actIds.set(act.id, id);
    activities[[p, sl, ...rest].join(':')] = { ...clone(act), id };
    const st = block.styles[`act:${act.id}`];
    if (st) styles[`act:${id}`] = clone(st);
  }
  const scenes = { ...map.scenes };
  for (const [stepId, id] of stepIdMap) {
    if (block.scenes[stepId]) scenes[id] = clone(block.scenes[stepId]);
    for (const kind of ['step', 'scene']) {
      const st = block.styles[`${kind}:${stepId}`];
      if (st) styles[`${kind}:${id}`] = clone(st);
    }
  }
  // Text rows: the same row when this map has it, else by position.
  const textRows = map.textRows.map((r, i) => {
    const src = block.textRows.find((b) => b.id === r.id) ?? (block.textRows.some((b) => map.textRows.some((m) => m.id === b.id)) ? undefined : block.textRows[i]);
    if (!src) return r;
    const cells = { ...r.cells };
    for (const [stepId, text] of Object.entries(src.cells)) if (stepIdMap.has(stepId)) cells[stepIdMap.get(stepId)!] = text;
    return { ...r, cells };
  });

  let steps: Step[];
  let nextPhases: Phase[];
  const phaseIds: Id[] = [];
  if (block.phases) {
    const k = Math.max(0, Math.min(at, phases.length));
    const start = phases.slice(0, k).reduce((n, p) => n + p.span, 0);
    const added = block.phases.map((p) => {
      const id = uid();
      phaseIds.push(id);
      const st = block.styles[`phase:${p.id}`];
      if (st) styles[`phase:${id}`] = clone(st);
      return { ...p, id };
    });
    nextPhases = phases.slice(0, k).concat(added, phases.slice(k));
    steps = map.steps.slice(0, start).concat(newSteps, map.steps.slice(start));
  } else {
    const i = Math.max(0, Math.min(at, map.steps.length));
    nextPhases = phases.map((p) => ({ ...p }));
    if (!nextPhases.length) nextPhases.push({ id: uid(), title: '', span: 0 });
    nextPhases[i > 0 ? phaseIndexOf(nextPhases, i - 1) : 0].span += newSteps.length;
    steps = map.steps.slice(0, i).concat(newSteps, map.steps.slice(i));
  }

  return {
    doc: {
      ...map,
      phases: nextPhases,
      steps,
      activities,
      scenes,
      textRows,
      styles,
      links: map.links.concat(linksWithin(block.links, actIds)),
      tagColors: withColors(map.tagColors, block.tagColors),
    },
    stepIds: newSteps.map((s) => s.id),
    phaseIds,
  };
}
