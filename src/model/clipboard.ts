// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Activity, Blueprint, BoxStyle, Flow, FlowNode, Id } from './types';
import { activityKey, activityKeyOf, addSlot, uid } from './ops';
import { addNode, extent, findNode } from './flow';

/**
 * A copied card: a map activity or a flow card, with its style and the
 * colours of its tags, so it can be pasted on a map or in a flow, of this
 * project or another one.
 */
export type CardClip =
  | { from: 'map'; card: Activity; personaId: Id; style?: BoxStyle; tagColors: Record<string, number> }
  | { from: 'flow'; card: FlowNode; style?: BoxStyle; tagColors: Record<string, number> };

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** The colours, among `colors`, of the tags in `tags`. */
function colorsOf(tags: string[] | undefined, colors: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const tag of tags ?? []) {
    const c = colors?.[tag.toLowerCase()];
    if (c !== undefined) out[tag.toLowerCase()] = c;
  }
  return out;
}

/** `into` with the colours of `add` it doesn't have yet: a tag already coloured here keeps its colour. */
function withColors(into: Record<string, number> | undefined, add: Record<string, number>): Record<string, number> | undefined {
  const missing = Object.entries(add).filter(([tag]) => into?.[tag] === undefined);
  return missing.length ? { ...into, ...Object.fromEntries(missing) } : into;
}

/** `styles` with the box at `key` styled as the copied card (or plain, when it had no style). */
function withStyle(styles: Record<string, BoxStyle>, key: string, style: BoxStyle | undefined): Record<string, BoxStyle> {
  const { [key]: _old, ...rest } = styles;
  return style ? { ...rest, [key]: { ...style } } : rest;
}

/** The map card at `key`, ready to paste. */
export function clipFromMap(map: Blueprint, key: string): CardClip | null {
  const act = map.activities[key];
  if (!act) return null;
  // The word above an alternative belongs to its place, not to the card.
  const { joiner: _joiner, ...card } = act;
  return { from: 'map', card: clone(card), personaId: key.split(':')[0], style: map.styles[`act:${act.id}`], tagColors: colorsOf(act.tags, map.tagColors) };
}

/** The flow card `id`, ready to paste. */
export function clipFromFlow(flow: Flow, id: Id): CardClip | null {
  const node = findNode(flow, id);
  if (!node) return null;
  return { from: 'flow', card: clone(node), style: flow.styles[`node:${id}`], tagColors: colorsOf(node.tags, flow.tagColors) };
}

/** What the copied card says, put on the system clipboard as plain text. */
export function clipText(clip: CardClip): string {
  return clip.card.text;
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

/**
 * The copied card as a flow card at (col, row). A map card keeps its
 * persona's colour, when the persona is one of the project's (`known`).
 */
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

const blank = (c: { text: string; tags?: string[]; note?: string }) => !c.text.trim() && !c.tags?.length && !c.note?.trim();

/** Puts the copied card at `key`, as the card `id` (the card there is replaced). */
function placeOnMap(map: Blueprint, clip: CardClip, key: string, id: Id): Blueprint {
  const card = asActivity(clip, id);
  const joiner = map.activities[key]?.joiner;
  if (joiner !== undefined) card.joiner = joiner;
  return {
    ...map,
    activities: { ...map.activities, [key]: card },
    styles: withStyle(map.styles, `act:${id}`, clip.style),
    tagColors: withColors(map.tagColors, clip.tagColors) ?? {},
  };
}

/**
 * Pastes a card next to the map card at `key`: in a new column right after
 * it, in the same step and persona row, as the card's + button does. When
 * the card at `key` is still empty (just created) and `fill` is set, the
 * copy takes its place instead.
 */
export function pasteOnMap(map: Blueprint, clip: CardClip, key: string, fill = true): { doc: Blueprint; activityId: Id | null } {
  const target = map.activities[key];
  if (!target) return { doc: map, activityId: null };
  if (fill && blank(target)) return { doc: placeOnMap(map, clip, key, target.id), activityId: target.id };
  const [personaId, slotId] = key.split(':');
  const step = map.steps.find((s) => s.slots.includes(slotId));
  if (!step) return { doc: map, activityId: null };
  const r = addSlot(map, step.id, slotId, personaId);
  const newKey = r.activityId ? activityKeyOf(r.doc, r.activityId) : undefined;
  if (!r.activityId || !newKey) return { doc: map, activityId: null };
  return { doc: placeOnMap(r.doc, clip, newKey, r.activityId), activityId: r.activityId };
}

/** Pastes a card in an empty cell of the map (persona row, column); next to the card there when it isn't empty. */
export function pasteInCell(map: Blueprint, clip: CardClip, personaId: Id, slotId: Id): { doc: Blueprint; activityId: Id | null } {
  const key = activityKey(personaId, slotId);
  if (map.activities[key]) return pasteOnMap(map, clip, key);
  if (!map.personas.some((p) => p.id === personaId) || !map.steps.some((s) => s.slots.includes(slotId))) return { doc: map, activityId: null };
  const id = uid();
  return { doc: placeOnMap(map, clip, key, id), activityId: id };
}

/**
 * Pastes a card in a flow: to the right of the card `afterId`, joined by an
 * arrow, as the card's right + does (the empty card `afterId` is filled
 * instead, when `fill` is set). With no card, the copy goes in a new column
 * at the end, on the first row, joined to nothing.
 */
export function pasteInFlow(flow: Flow, clip: CardClip, afterId: Id | null, known: (personaId: Id) => boolean, fill = true): { flow: Flow; nodeId: Id | null } {
  const after = afterId ? findNode(flow, afterId) : undefined;
  if (afterId && !after) return { flow, nodeId: null };
  let next = flow;
  let id: Id;
  if (after && fill && (after.kind === 'activity' || after.kind === 'choice') && blank(after)) {
    id = after.id;
  } else if (after) {
    const r = addNode(flow, after.id, 'right');
    if (!r.nodeId) return { flow, nodeId: null };
    next = r.flow;
    id = r.nodeId;
  } else {
    id = uid();
    const col = flow.nodes.length ? extent(flow).cols : 0;
    next = { ...flow, nodes: flow.nodes.concat([{ id, kind: 'activity', col, row: 0, text: '' }]) };
  }
  const placed = next.nodes.find((n) => n.id === id)!;
  const node = asNode(clip, id, placed.col, placed.row, known);
  return {
    flow: {
      ...next,
      nodes: next.nodes.map((n) => (n.id === id ? node : n)),
      styles: withStyle(next.styles, `node:${id}`, clip.style),
      tagColors: withColors(next.tagColors, clip.tagColors),
    },
    nodeId: id,
  };
}
