// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Blueprint, BoxStyle, Flow, FlowDoc, Id, MissionMapDoc, Persona, PersonaSheet, PersonaSheetDoc, Project, ProjectDoc } from './types';
import { setPersona, uid } from './ops';

export const PROJECT_VERSION = 2;

/** A project holding a single mission map. */
export function projectFromMap(title: string, map: Blueprint, name = ''): Project {
  return { version: PROJECT_VERSION, title, docs: [{ id: uid(), kind: 'mission-map', name, map }] };
}

export function findDoc(project: Project, docId: Id): ProjectDoc | undefined {
  return project.docs.find((d) => d.id === docId);
}

/** The document to show first when a project is opened. */
export function firstDocId(project: Project): Id {
  return project.docs[0].id;
}

/** The mission map `docId`, if that document is one. */
export function missionMapOf(project: Project, docId: Id): MissionMapDoc | undefined {
  const doc = findDoc(project, docId);
  return doc?.kind === 'mission-map' ? doc : undefined;
}

/**
 * Applies `fn` to the mission map `docId`. Returns the same project when
 * nothing changed, so callers can skip history entries.
 */
export function updateMap(project: Project, docId: Id, fn: (map: Blueprint) => Blueprint): Project {
  const doc = missionMapOf(project, docId);
  if (!doc) return project;
  const map = fn(doc.map);
  if (map === doc.map) return project;
  return { ...project, docs: project.docs.map((d) => (d.id === docId ? { ...doc, map } : d)) };
}

export function setProjectTitle(project: Project, title: string): Project {
  return title === project.title ? project : { ...project, title };
}

/** Adds a document after `afterId` (at the end by default). */
export function addDoc(project: Project, doc: ProjectDoc, afterId?: Id): Project {
  const docs = project.docs.slice();
  const at = afterId ? docs.findIndex((d) => d.id === afterId) + 1 : docs.length;
  docs.splice(at > 0 ? at : docs.length, 0, doc);
  return { ...project, docs };
}

/** Removes a document; a project always keeps one. Sheets of a removed mission map keep their own copy, and its flows stay. */
export function removeDoc(project: Project, docId: Id): Project {
  if (project.docs.length <= 1 || !findDoc(project, docId)) return project;
  const docs = project.docs
    .filter((d) => d.id !== docId)
    .map((d) => {
      if (d.kind === 'persona' && d.sheet.link?.docId === docId) return { ...d, sheet: { ...d.sheet, link: null } };
      // A flow detailing part of the removed map no longer does.
      if (d.kind === 'flow' && d.flow.source?.docId === docId) {
        const { source: _gone, ...flow } = d.flow;
        return { ...d, flow };
      }
      return d;
    });
  return { ...project, docs };
}

export function sheetOf(project: Project, docId: Id): PersonaSheetDoc | undefined {
  const doc = findDoc(project, docId);
  return doc?.kind === 'persona' ? doc : undefined;
}

export function updateSheet(project: Project, docId: Id, fn: (sheet: PersonaSheet) => PersonaSheet): Project {
  const doc = sheetOf(project, docId);
  if (!doc) return project;
  const sheet = fn(doc.sheet);
  if (sheet === doc.sheet) return project;
  return { ...project, docs: project.docs.map((d) => (d.id === docId ? { ...doc, sheet } : d)) };
}

/** The sheet describing a mission map persona, if there is one. */
export function sheetFor(project: Project, mapDocId: Id, personaId: Id): PersonaSheetDoc | undefined {
  return project.docs.find(
    (d): d is PersonaSheetDoc => d.kind === 'persona' && d.sheet.link?.docId === mapDocId && d.sheet.link.personaId === personaId,
  );
}

/** The mission map persona a sheet describes, while it still exists. */
export function linkedPersona(project: Project, sheet: PersonaSheet): { persona: Persona; mapDocId: Id; style: BoxStyle | undefined } | undefined {
  if (!sheet.link) return undefined;
  const map = missionMapOf(project, sheet.link.docId)?.map;
  const persona = map?.personas.find((p) => p.id === sheet.link!.personaId);
  return map && persona ? { persona, mapDocId: sheet.link.docId, style: map.styles[`persona:${persona.id}`] } : undefined;
}

/**
 * The name, role and colour a sheet shows: its persona's while linked and
 * kept in sync, else its own.
 */
export function sheetIdentity(project: Project, sheet: PersonaSheet): { name: string; role: string; color: number; style: BoxStyle | undefined; synced: boolean } {
  const linked = sheet.sync ? linkedPersona(project, sheet) : undefined;
  if (linked) return { name: linked.persona.name, role: linked.persona.role, color: linked.persona.color, style: linked.style, synced: true };
  return { name: sheet.name, role: sheet.role, color: sheet.color, style: undefined, synced: false };
}

/**
 * Renames a sheet's persona. While linked and in sync the mission map
 * persona changes too; the sheet keeps a copy in case the link goes.
 */
export function setSheetIdentity(project: Project, docId: Id, patch: { name?: string; role?: string }): Project {
  const doc = sheetOf(project, docId);
  if (!doc) return project;
  let next = updateSheet(project, docId, (s) => ({ ...s, ...patch }));
  const linked = doc.sheet.sync ? linkedPersona(project, doc.sheet) : undefined;
  if (linked) next = updateMap(next, linked.mapDocId, (m) => setPersona(m, linked.persona.id, patch));
  return next;
}

/** Turns syncing on or off; off, the sheet starts from its persona's current name, role and colour. */
export function setSheetSync(project: Project, docId: Id, sync: boolean): Project {
  const doc = sheetOf(project, docId);
  if (!doc || doc.sheet.sync === sync) return project;
  const linked = linkedPersona(project, doc.sheet);
  return updateSheet(project, docId, (s) =>
    linked ? { ...s, sync, name: linked.persona.name, role: linked.persona.role, color: linked.persona.color } : { ...s, sync },
  );
}

/** Where a persona appears in a mission map, for its sheet's summary. */
export function personaFootprint(map: Blueprint, personaId: Id): { steps: number; activities: number; tags: { tag: string; count: number }[] } {
  const slotStep = new Map<Id, Id>();
  for (const step of map.steps) for (const slot of step.slots) slotStep.set(slot, step.id);
  const steps = new Set<Id>();
  const tags = new Map<string, { tag: string; count: number }>();
  let activities = 0;
  for (const [key, act] of Object.entries(map.activities)) {
    const [pid, slot] = key.split(':');
    if (pid !== personaId || !slotStep.has(slot)) continue;
    activities++;
    steps.add(slotStep.get(slot)!);
    for (const tag of act.tags ?? []) {
      const entry = tags.get(tag.toLowerCase()) ?? { tag, count: 0 };
      entry.count++;
      tags.set(tag.toLowerCase(), entry);
    }
  }
  return { steps: steps.size, activities, tags: [...tags.values()].sort((a, b) => b.count - a.count) };
}

export function flowOf(project: Project, docId: Id): FlowDoc | undefined {
  const doc = findDoc(project, docId);
  return doc?.kind === 'flow' ? doc : undefined;
}

export function updateFlow(project: Project, docId: Id, fn: (flow: Flow) => Flow): Project {
  const doc = flowOf(project, docId);
  if (!doc) return project;
  const flow = fn(doc.flow);
  if (flow === doc.flow) return project;
  return { ...project, docs: project.docs.map((d) => (d.id === docId ? { ...doc, flow } : d)) };
}

export function renameDoc(project: Project, docId: Id, name: string): Project {
  const doc = findDoc(project, docId);
  if (!doc || doc.name === name) return project;
  return { ...project, docs: project.docs.map((d) => (d.id === docId ? { ...d, name } : d)) };
}

/** The personas of the project's mission maps, for colouring flow cards and showing their photo. */
export function projectPersonas(project: Project): { persona: Persona; style: BoxStyle | undefined; photo: string | null }[] {
  return project.docs.flatMap((d) =>
    d.kind === 'mission-map'
      ? d.map.personas.map((persona) => ({ persona, style: d.map.styles[`persona:${persona.id}`], photo: sheetFor(project, d.id, persona.id)?.sheet.photo ?? null }))
      : [],
  );
}
