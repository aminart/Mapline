// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Blueprint, BoxKey, BoxStyle, Id, Link, Phase, Scene } from './types';
import { PERSONA_PALETTE } from './theme';

export function uid(): Id {
  return Math.random().toString(36).slice(2, 10);
}

export function activityKey(personaId: Id, slotId: Id): string {
  return `${personaId}:${slotId}`;
}

/** Phases always cover every step exactly once, in order. */
const ALT = ':b';

/** Key of the second card (alternative) sharing a cell with the card at `key`. */
export function altKey(key: string): string {
  return key + ALT;
}

export function isAltKey(key: string): boolean {
  return key.endsWith(ALT);
}

/** An alternative whose main card is gone takes its place. */
function promoteAlternatives(activities: Blueprint['activities']): Blueprint['activities'] {
  const out = { ...activities };
  for (const key of Object.keys(out)) {
    if (!isAltKey(key)) continue;
    const main = key.slice(0, -ALT.length);
    if (!out[main]) {
      const { joiner: _joiner, ...card } = out[key];
      out[main] = card;
      delete out[key];
    }
  }
  return out;
}

export function normalizePhases(phases: Phase[], stepCount: number): Phase[] {
  const ph = phases.map((p) => ({ ...p, span: Math.max(1, Math.floor(p.span)) }));
  if (ph.length === 0) return stepCount > 0 ? [{ id: uid(), title: '', span: stepCount }] : [];
  let sum = ph.reduce((n, p) => n + p.span, 0);
  while (sum > stepCount && ph.length > 0) {
    const last = ph[ph.length - 1];
    if (last.span > 1) last.span--;
    else if (ph.length > 1) ph.pop();
    else break;
    sum--;
  }
  if (sum < stepCount) ph[ph.length - 1].span += stepCount - sum;
  return ph;
}

export function phaseIndexOf(phases: Phase[], stepIndex: number): number {
  let start = 0;
  for (let k = 0; k < phases.length; k++) {
    if (stepIndex < start + phases[k].span) return k;
    start += phases[k].span;
  }
  return phases.length - 1;
}

/** Drops activities, links and scenes that no longer have a home. */
function prune(doc: Blueprint): Blueprint {
  const personas = new Set(doc.personas.map((p) => p.id));
  const slots = new Set(doc.steps.flatMap((s) => s.slots));
  const steps = new Set(doc.steps.map((s) => s.id));
  const activities: Blueprint['activities'] = {};
  const alive = new Set<Id>();
  for (const [key, act] of Object.entries(promoteAlternatives(doc.activities))) {
    const [personaId, slotId] = key.split(':');
    if (personas.has(personaId) && slots.has(slotId)) {
      activities[key] = act;
      alive.add(act.id);
    }
  }
  const scenes: Blueprint['scenes'] = {};
  for (const [stepId, scene] of Object.entries(doc.scenes)) if (steps.has(stepId)) scenes[stepId] = scene;
  const infos: Blueprint['infos'] = {};
  for (const [stepId, info] of Object.entries(doc.infos)) if (steps.has(stepId)) infos[stepId] = info;
  const links = doc.links.filter((l) => alive.has(l.from) && alive.has(l.to));
  const dividers = doc.dividers.filter((d) => d.after === DIVIDER_TOP || personas.has(d.after));
  return { ...doc, activities, scenes, infos, links, dividers };
}

// Steps

export function insertStep(doc: Blueprint, index: number): { doc: Blueprint; stepId: Id } {
  const stepId = uid();
  const steps = doc.steps.slice();
  const phases = normalizePhases(doc.phases, steps.length);
  if (phases.length === 0) phases.push({ id: uid(), title: '', span: 0 });
  phases[phaseIndexOf(phases, index)].span++;
  steps.splice(index, 0, { id: stepId, title: '', slots: [uid()] });
  return { doc: { ...doc, steps, phases }, stepId };
}

export function removeStep(doc: Blueprint, index: number): Blueprint {
  const steps = doc.steps.slice();
  const phases = normalizePhases(doc.phases, steps.length);
  const k = phaseIndexOf(phases, index);
  phases[k].span--;
  if (phases[k].span === 0) phases.splice(k, 1);
  steps.splice(index, 1);
  return prune({ ...doc, steps, phases });
}

export function setStepTitle(doc: Blueprint, stepId: Id, title: string): Blueprint {
  return { ...doc, steps: doc.steps.map((s) => (s.id === stepId ? { ...s, title } : s)) };
}

/**
 * Adds a column of activities to a step, after `afterSlot` (or at the end).
 * When `personaId` is given, an empty activity is created for it there.
 */
export function addSlot(
  doc: Blueprint,
  stepId: Id,
  afterSlot: Id | null,
  personaId: Id | null,
): { doc: Blueprint; activityId: Id | null } {
  const slot = uid();
  const steps = doc.steps.map((s) => {
    if (s.id !== stepId) return s;
    const slots = s.slots.slice();
    const at = afterSlot ? slots.indexOf(afterSlot) + 1 : slots.length;
    slots.splice(at, 0, slot);
    return { ...s, slots };
  });
  if (!personaId) return { doc: { ...doc, steps }, activityId: null };
  const activityId = uid();
  const activities = { ...doc.activities, [activityKey(personaId, slot)]: { id: activityId, text: '' } };
  return { doc: { ...doc, steps, activities }, activityId };
}

export function removeLastSlot(doc: Blueprint, stepId: Id): Blueprint {
  const steps = doc.steps.map((s) =>
    s.id === stepId && s.slots.length > 1 ? { ...s, slots: s.slots.slice(0, -1) } : s,
  );
  return prune({ ...doc, steps });
}

// Phases

export function setPhaseTitle(doc: Blueprint, index: number, title: string): Blueprint {
  const phases = normalizePhases(doc.phases, doc.steps.length);
  phases[index] = { ...phases[index], title };
  return { ...doc, phases };
}

/** Moves the right edge of phase `index` by one step (dir = +1 grows, -1 shrinks). */
export function movePhaseEdge(doc: Blueprint, index: number, dir: 1 | -1): Blueprint {
  const phases = normalizePhases(doc.phases, doc.steps.length);
  const next = phases[index + 1];
  if (!next) return doc;
  if (dir > 0) {
    phases[index].span++;
    next.span--;
    if (next.span === 0) phases.splice(index + 1, 1);
  } else if (phases[index].span > 1) {
    phases[index].span--;
    next.span++;
  }
  return { ...doc, phases };
}

export function addPhase(doc: Blueprint): Blueprint {
  const phases = normalizePhases(doc.phases, doc.steps.length);
  const last = phases[phases.length - 1];
  if (last && last.span > 1) {
    last.span--;
    phases.push({ id: uid(), title: '', span: 1 });
    return { ...doc, phases };
  }
  // No step to spare: the new phase comes with a new step.
  const steps = doc.steps.concat([{ id: uid(), title: '', slots: [uid()] }]);
  phases.push({ id: uid(), title: '', span: 1 });
  return { ...doc, steps, phases };
}

/** Removes a phase by merging its steps into the neighbouring phase. */
export function removePhase(doc: Blueprint, index: number): Blueprint {
  const phases = normalizePhases(doc.phases, doc.steps.length);
  if (phases.length < 2) return doc;
  const into = index > 0 ? index - 1 : 1;
  phases[into].span += phases[index].span;
  phases.splice(index, 1);
  return { ...doc, phases };
}

// Personas

export function addPersona(doc: Blueprint): Blueprint {
  const color = doc.personas.length % PERSONA_PALETTE.length;
  return { ...doc, personas: doc.personas.concat([{ id: uid(), name: '', role: '', color }]) };
}

export function removePersona(doc: Blueprint, personaId: Id): Blueprint {
  return prune({ ...doc, personas: doc.personas.filter((p) => p.id !== personaId) });
}

export function setPersona(doc: Blueprint, personaId: Id, patch: { name?: string; role?: string }): Blueprint {
  return { ...doc, personas: doc.personas.map((p) => (p.id === personaId ? { ...p, ...patch } : p)) };
}

// Activities

export function createActivity(doc: Blueprint, personaId: Id, slotId: Id): { doc: Blueprint; activityId: Id } {
  const activityId = uid();
  const activities = { ...doc.activities, [activityKey(personaId, slotId)]: { id: activityId, text: '' } };
  return { doc: { ...doc, activities }, activityId };
}

/** Adds a second card under the one at `key`, for an alternative at the same moment. */
export function addAlternative(doc: Blueprint, key: string): { doc: Blueprint; activityId: Id | null } {
  if (!doc.activities[key] || isAltKey(key) || doc.activities[altKey(key)]) return { doc, activityId: null };
  const activityId = uid();
  return { doc: { ...doc, activities: { ...doc.activities, [altKey(key)]: { id: activityId, text: '' } } }, activityId };
}

/** The word above an alternative card, e.g. "or", "else", "if refused". */
export function setJoiner(doc: Blueprint, key: string, joiner: string): Blueprint {
  const act = doc.activities[key];
  if (!act || !isAltKey(key)) return doc;
  return { ...doc, activities: { ...doc.activities, [key]: { ...act, joiner } } };
}

export function setActivityText(doc: Blueprint, key: string, text: string): Blueprint {
  const act = doc.activities[key];
  if (!act) return doc;
  return { ...doc, activities: { ...doc.activities, [key]: { ...act, text } } };
}

export function setActivityNote(doc: Blueprint, key: string, note: string): Blueprint {
  const act = doc.activities[key];
  if (!act) return doc;
  const { note: _old, ...rest } = act;
  const next = note.trim() ? { ...rest, note } : rest;
  return { ...doc, activities: { ...doc.activities, [key]: next } };
}

export interface NoteEntry {
  stepIndex: number;
  stepTitle: string;
  persona: string;
  activity: string;
  note: string;
}

/** Every activity note, in board order (step by step, then persona). */
export function collectNotes(doc: Blueprint): NoteEntry[] {
  const out: NoteEntry[] = [];
  doc.steps.forEach((step, stepIndex) => {
    for (const persona of doc.personas) {
      for (const slot of step.slots) {
        const key = activityKey(persona.id, slot);
        for (const act of [doc.activities[key], doc.activities[altKey(key)]]) {
          if (act?.note?.trim()) {
            out.push({ stepIndex, stepTitle: step.title, persona: persona.name, activity: act.text.trim(), note: act.note.trim() });
          }
        }
      }
    }
  });
  return out;
}

export const MAX_TAG_LENGTH = 30;

/** Adds a tag to an activity, ignoring blanks and duplicates (case-insensitive). */
export function addTag(doc: Blueprint, key: string, tag: string): Blueprint {
  const act = doc.activities[key];
  const clean = tag.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH);
  if (!act || !clean) return doc;
  const tags = act.tags ?? [];
  if (tags.some((x) => x.toLowerCase() === clean.toLowerCase())) return doc;
  return { ...doc, activities: { ...doc.activities, [key]: { ...act, tags: tags.concat([clean]) } } };
}

export function removeTag(doc: Blueprint, key: string, tag: string): Blueprint {
  const act = doc.activities[key];
  if (!act?.tags?.includes(tag)) return doc;
  return { ...doc, activities: { ...doc.activities, [key]: { ...act, tags: act.tags.filter((x) => x !== tag) } } };
}

/** Every tag used in the project, for suggestions. */
export function allTags(doc: Blueprint): string[] {
  const seen = new Map<string, string>();
  for (const act of Object.values(doc.activities)) for (const tag of act.tags ?? []) seen.set(tag.toLowerCase(), tag);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function removeActivity(doc: Blueprint, key: string): Blueprint {
  const activities = { ...doc.activities };
  delete activities[key];
  return prune({ ...doc, activities });
}

// Links

/** Adds an arrow from → to, or removes it if it already exists. */
export function toggleLink(doc: Blueprint, from: Id, to: Id): Blueprint {
  if (from === to) return doc;
  const exists = doc.links.some((l) => l.from === from && l.to === to);
  const links = exists
    ? doc.links.filter((l) => !(l.from === from && l.to === to))
    : doc.links.concat([{ id: uid(), from, to }]);
  return { ...doc, links };
}

export function removeLink(doc: Blueprint, linkId: Id): Blueprint {
  return { ...doc, links: doc.links.filter((l) => l.id !== linkId) };
}

// Storyboard

export function setInfo(doc: Blueprint, stepId: Id, text: string): Blueprint {
  return { ...doc, infos: { ...doc.infos, [stepId]: text } };
}

export function setScene(doc: Blueprint, stepId: Id, patch: Partial<Scene>): Blueprint {
  const prev = doc.scenes[stepId] ?? { img: null, text: '' };
  return { ...doc, scenes: { ...doc.scenes, [stepId]: { ...prev, ...patch } } };
}

// Styles

export function setBoxStyle(doc: Blueprint, key: BoxKey, patch: BoxStyle): Blueprint {
  return { ...doc, styles: { ...doc.styles, [key]: { ...doc.styles[key], ...patch } } };
}

export function resetBoxStyle(doc: Blueprint, key: BoxKey): Blueprint {
  const styles = { ...doc.styles };
  delete styles[key];
  return { ...doc, styles };
}

/** The flat list of activity columns, left to right. */
export function columns(doc: Blueprint): { stepId: Id; slotId: Id; stepIndex: number }[] {
  return doc.steps.flatMap((s, stepIndex) => s.slots.map((slotId) => ({ stepId: s.id, slotId, stepIndex })));
}

// Reordering (drag and drop)

function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Moves an activity to another cell. If the target holds an activity, the
 * two swap places. Arrows follow, since they point at activity ids.
 */
export function moveActivity(doc: Blueprint, fromKey: string, toKey: string): Blueprint {
  const act = doc.activities[fromKey];
  if (!act || fromKey === toKey) return doc;
  const activities = { ...doc.activities };
  const other = activities[toKey];
  activities[toKey] = act;
  if (other) activities[fromKey] = other;
  else delete activities[fromKey];
  return { ...doc, activities: promoteAlternatives(activities) };
}

/**
 * Moves a step (with its activities and scene) to another position. Phases
 * keep their sizes, so the step joins whichever phase covers its new place.
 */
export function moveStep(doc: Blueprint, from: number, to: number): Blueprint {
  if (from === to || from < 0 || to < 0 || from >= doc.steps.length || to >= doc.steps.length) return doc;
  return { ...doc, steps: moveItem(doc.steps, from, to) };
}

/** Moves a persona row; separators stay under their persona. */
export function movePersona(doc: Blueprint, from: number, to: number): Blueprint {
  if (from === to || from < 0 || to < 0 || from >= doc.personas.length || to >= doc.personas.length) return doc;
  return { ...doc, personas: moveItem(doc.personas, from, to) };
}

// Arrows

export function updateLink(doc: Blueprint, linkId: Id, patch: Partial<Pick<Link, 'label' | 'style' | 'color'>>): Blueprint {
  return { ...doc, links: doc.links.map((l) => (l.id === linkId ? { ...l, ...patch } : l)) };
}

// Separators

/** `after` value of a divider drawn above the first persona. */
export const DIVIDER_TOP = '';

export function addDivider(doc: Blueprint, after: Id, label: string): Blueprint {
  if (doc.dividers.some((d) => d.after === after)) return doc;
  return { ...doc, dividers: doc.dividers.concat([{ id: uid(), after, label }]) };
}

export function setDividerLabel(doc: Blueprint, id: Id, label: string): Blueprint {
  return { ...doc, dividers: doc.dividers.map((d) => (d.id === id ? { ...d, label } : d)) };
}

export function removeDivider(doc: Blueprint, id: Id): Blueprint {
  return { ...doc, dividers: doc.dividers.filter((d) => d.id !== id) };
}

// Tags across the project

/** How many activities carry each tag (keyed by the tag as first written). */
export function tagCounts(doc: Blueprint): { tag: string; count: number }[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const act of Object.values(doc.activities)) {
    for (const tag of act.tags ?? []) {
      const key = tag.toLowerCase();
      const entry = counts.get(key) ?? { tag, count: 0 };
      entry.count++;
      counts.set(key, entry);
    }
  }
  return [...counts.values()].sort((a, b) => a.tag.localeCompare(b.tag));
}

export function setTagColor(doc: Blueprint, tag: string, color: number): Blueprint {
  return { ...doc, tagColors: { ...doc.tagColors, [tag.toLowerCase()]: color } };
}

/** Removes a tag from every activity. */
export function deleteTagEverywhere(doc: Blueprint, tag: string): Blueprint {
  const key = tag.toLowerCase();
  const activities: Blueprint['activities'] = {};
  for (const [k, act] of Object.entries(doc.activities)) {
    activities[k] = act.tags?.some((t) => t.toLowerCase() === key)
      ? { ...act, tags: act.tags.filter((t) => t.toLowerCase() !== key) }
      : act;
  }
  const tagColors = { ...doc.tagColors };
  delete tagColors[key];
  return { ...doc, activities, tagColors };
}
