// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Current state and target state: a map or a flow can be copied as the
 * target state of another (its current state). The copy keeps the ids of
 * its cards, so the two can be compared card by card.
 */

import type { Activity, Blueprint, Flow, FlowDoc, FlowLink, FlowNode, Id, MissionMapDoc, Project } from './types';
import { addDoc, findDoc } from './project';
import { activityKeyOf, cellKey, uid } from './ops';
import { insertColumn } from './flow';

export type StateDoc = MissionMapDoc | FlowDoc;

const isStateDoc = (d: unknown): d is StateDoc => !!d && ((d as StateDoc).kind === 'mission-map' || (d as StateDoc).kind === 'flow');

/** The current state a target document is compared with, while it exists. */
export function baselineOf(project: Project, docId: Id): StateDoc | undefined {
  const doc = findDoc(project, docId);
  if (!isStateDoc(doc) || !doc.baseline) return undefined;
  const base = findDoc(project, doc.baseline);
  return isStateDoc(base) && base.kind === doc.kind && base.id !== doc.id ? base : undefined;
}

/** The target states made from `docId`. */
export function targetsOf(project: Project, docId: Id): StateDoc[] {
  return project.docs.filter((d): d is StateDoc => isStateDoc(d) && d.baseline === docId && d.id !== docId);
}

/**
 * Copies a map or a flow as its target state, right after the last target
 * made from it (or after it). The copy keeps its cards' ids.
 */
export function makeTarget(project: Project, docId: Id, name: string): { project: Project; docId: Id | null } {
  const doc = findDoc(project, docId);
  if (!isStateDoc(doc)) return { project, docId: null };
  const { detachedFrom: _was, ...source } = structuredClone(doc);
  const copy = { ...source, id: uid(), name, baseline: doc.id } as StateDoc;
  const after = targetsOf(project, docId).at(-1)?.id ?? docId;
  return { project: addDoc(project, copy, after), docId: copy.id };
}

/**
 * Stops comparing a target with its current state: both stay, and the
 * target remembers its current state, to compare them again.
 */
export function detachTarget(project: Project, docId: Id): Project {
  const doc = findDoc(project, docId);
  if (!isStateDoc(doc) || !doc.baseline) return project;
  const { baseline, ...rest } = doc;
  const detached = { ...rest, detachedFrom: baseline } as StateDoc;
  return { ...project, docs: project.docs.map((d) => (d.id === docId ? detached : d)) };
}

/** The current state a former target was compared with, while it exists. */
export function detachedBaseOf(project: Project, docId: Id): StateDoc | undefined {
  const doc = findDoc(project, docId);
  if (!isStateDoc(doc) || doc.baseline || !doc.detachedFrom) return undefined;
  const base = findDoc(project, doc.detachedFrom);
  return isStateDoc(base) && base.kind === doc.kind && base.id !== doc.id ? base : undefined;
}

/** Compares a former target with its current state again. */
export function reattachTarget(project: Project, docId: Id): Project {
  const base = detachedBaseOf(project, docId);
  if (!base) return project;
  const doc = findDoc(project, docId) as StateDoc;
  const { detachedFrom: _was, ...rest } = doc;
  const attached = { ...rest, baseline: base.id } as StateDoc;
  return { ...project, docs: project.docs.map((d) => (d.id === docId ? attached : d)) };
}

export type Change = 'added' | 'modified';

/** How a target differs from its current state, card by card. */
export interface Diff<T> {
  /** Cards of the target that are new or changed, by id. */
  changes: Record<Id, Change>;
  /** For changed cards, their text in the current state when it differs. */
  before: Record<Id, string>;
  /** Cards of the current state the target no longer has. */
  removed: T[];
}

const sameTags = (a: string[] | undefined, b: string[] | undefined) => (a ?? []).join('\n') === (b ?? []).join('\n');
/** Same personas on a card, whatever the order they were picked in. */
const samePersonas = (a: Id[] | undefined, b: Id[] | undefined) => [...(a ?? [])].sort().join('\n') === [...(b ?? [])].sort().join('\n');

/**
 * Activities added, changed (text, kind, tags, or moved to another cell) or
 * removed. Removed ones come with the cell they were in.
 */
export function diffMap(base: Blueprint, target: Blueprint): Diff<{ key: string; activity: Activity }> {
  const before = new Map<Id, { key: string; activity: Activity }>();
  for (const [key, activity] of Object.entries(base.activities)) before.set(activity.id, { key, activity });
  const diff: Diff<{ key: string; activity: Activity }> = { changes: {}, before: {}, removed: [] };
  const kept = new Set<Id>();
  for (const [key, act] of Object.entries(target.activities)) {
    const old = before.get(act.id);
    if (!old) {
      diff.changes[act.id] = 'added';
      continue;
    }
    kept.add(act.id);
    const moved = old.key !== key;
    const textChanged = old.activity.text.trim() !== act.text.trim();
    if (moved || textChanged || (old.activity.kind ?? '') !== (act.kind ?? '') || !sameTags(old.activity.tags, act.tags)) {
      diff.changes[act.id] = 'modified';
      if (textChanged) diff.before[act.id] = old.activity.text;
    }
  }
  for (const [id, entry] of before) if (!kept.has(id)) diff.removed.push(entry);
  return diff;
}

/** Cards added, changed (text, kind, tags, persona) or removed; moving a card on the grid isn't a change. */
export function diffFlow(base: Flow, target: Flow): Diff<FlowNode> {
  const before = new Map(base.nodes.map((n) => [n.id, n]));
  const diff: Diff<FlowNode> = { changes: {}, before: {}, removed: [] };
  const kept = new Set<Id>();
  for (const node of target.nodes) {
    const old = before.get(node.id);
    if (!old) {
      diff.changes[node.id] = 'added';
      continue;
    }
    kept.add(node.id);
    const textChanged = old.text.trim() !== node.text.trim();
    if (textChanged || old.kind !== node.kind || !samePersonas(old.personaIds, node.personaIds) || !sameTags(old.tags, node.tags)) {
      diff.changes[node.id] = 'modified';
      if (textChanged) diff.before[node.id] = old.text;
    }
  }
  for (const node of base.nodes) if (!kept.has(node.id)) diff.removed.push(node);
  return diff;
}

/** How a target's arrows differ from its current state's. */
export interface LinkDiff {
  /** Arrows of the target between two cards the current state didn't link. */
  added: Id[];
  /** Arrows of both whose label changed. */
  modified: Id[];
  /** Arrows of the current state the target no longer has. */
  removed: FlowLink[];
}

/**
 * Arrows added, relabelled or removed. An arrow is the same in both when it
 * links the same two cards the same way, even redrawn.
 */
export function diffFlowLinks(base: Flow, target: Flow): LinkDiff {
  const key = (l: FlowLink) => `${l.from}>${l.to}`;
  const before = new Map(base.links.map((l) => [key(l), l]));
  const after = new Set(target.links.map(key));
  const diff: LinkDiff = { added: [], modified: [], removed: [] };
  for (const link of target.links) {
    const old = before.get(key(link));
    if (!old) diff.added.push(link.id);
    else if ((old.label ?? '').trim() !== (link.label ?? '').trim()) diff.modified.push(link.id);
  }
  for (const link of base.links) if (!after.has(key(link))) diff.removed.push(link);
  return diff;
}

/** One change of a flow, where it is, to go from one to the next. */
export interface FlowChange {
  id: Id;
  change: Change | 'removed';
  col: number;
  row: number;
}

/** A flow's changed cards, column by column, top to bottom; removed ones where they were. */
export function flowChanges(target: Flow, diff: Diff<FlowNode>): FlowChange[] {
  const list: FlowChange[] = target.nodes.filter((n) => diff.changes[n.id]).map((n) => ({ id: n.id, change: diff.changes[n.id], col: n.col, row: n.row }));
  for (const n of diff.removed) list.push({ id: n.id, change: 'removed', col: n.col, row: n.row });
  return list.sort((a, b) => a.col - b.col || a.row - b.row);
}

/**
 * Where the removed cards are drawn over the target: in their cell when it
 * is free, otherwise in the same column, in a row under the flow.
 */
export function placeGhosts(target: Flow, removed: FlowNode[]): FlowNode[] {
  const taken = new Set(target.nodes.map((n) => `${n.col}:${n.row}`));
  const spare = Math.max(-1, ...target.nodes.map((n) => n.row), ...removed.map((n) => n.row)) + 1;
  const placed: FlowNode[] = [];
  for (const node of removed) {
    if (!taken.has(`${node.col}:${node.row}`)) {
      taken.add(`${node.col}:${node.row}`);
      placed.push(node);
      continue;
    }
    let row = spare;
    while (taken.has(`${node.col}:${row}`)) row++;
    taken.add(`${node.col}:${row}`);
    placed.push({ ...node, row });
  }
  return placed;
}

/** How many cards were added, changed and removed. */
export function diffCounts(diff: Diff<unknown>): { added: number; modified: number; removed: number } {
  const values = Object.values(diff.changes);
  return {
    added: values.filter((c) => c === 'added').length,
    modified: values.filter((c) => c === 'modified').length,
    removed: diff.removed.length,
  };
}

export { cellKey };

/** Puts a removed activity back in its cell, when the cell still exists and is empty. */
export function restoreActivity(map: Blueprint, key: string, activity: Activity): Blueprint {
  const cell = cellKey(key);
  if (map.activities[cell] || map.activities[activityKeyOf(map, activity.id) ?? '']) return map;
  const [personaId, slot] = cell.split(':');
  if (!map.personas.some((p) => p.id === personaId) || !map.steps.some((s) => s.slots.includes(slot))) return map;
  const { joiner: _joiner, ...card } = activity;
  return { ...map, activities: { ...map.activities, [cell]: card } };
}

/**
 * Puts a removed card back where it was, with its arrows to cards still
 * there. When another card took its place, a column is inserted for it.
 */
export function restoreNode(flow: Flow, base: Flow, node: FlowNode): Flow {
  if (flow.nodes.some((n) => n.id === node.id)) return flow;
  if (flow.nodes.some((n) => n.col === node.col && n.row === node.row)) flow = insertColumn(flow, node.col);
  const ids = new Set(flow.nodes.map((n) => n.id).concat(node.id));
  const linkIds = new Set(flow.links.map((l) => l.id));
  const links = base.links.filter((l) => (l.from === node.id || l.to === node.id) && ids.has(l.from) && ids.has(l.to) && !linkIds.has(l.id));
  return { ...flow, nodes: flow.nodes.concat([node]), links: flow.links.concat(links) };
}
