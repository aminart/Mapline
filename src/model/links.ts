// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Links between a project's documents: a flow details a phase, a step or an
 * activity of a mission map, and has a main persona; a persona's sheet links
 * to the flows that persona is in.
 */

import type { Flow, FlowDoc, FlowSource, Id, PersonaSheetDoc, Project } from './types';
import { activityKeyOf, normalizePhases } from './ops';
import { addDoc, linkedPersona, missionMapOf, updateFlow } from './project';

/** The flows detailing a phase, a step or an activity of the map `docId`. */
export function flowsDetailing(project: Project, docId: Id, kind: FlowSource['kind'], id: Id): FlowDoc[] {
  return project.docs.filter((d): d is FlowDoc => d.kind === 'flow' && d.flow.source?.docId === docId && d.flow.source.kind === kind && d.flow.source.id === id);
}

/** What a flow's source is, while it still exists: its kind, its number (steps), its title, and its persona (activities). */
export interface ResolvedSource {
  source: FlowSource;
  /** Step number from 1, for steps and the step of an activity. */
  step: number;
  title: string;
  personaId: Id | null;
}

export function resolveSource(project: Project, source: FlowSource | undefined): ResolvedSource | undefined {
  if (!source) return undefined;
  const map = missionMapOf(project, source.docId)?.map;
  if (!map) return undefined;
  if (source.kind === 'phase') {
    const phase = normalizePhases(map.phases, map.steps.length).find((p) => p.id === source.id);
    return phase ? { source, step: 0, title: phase.title, personaId: null } : undefined;
  }
  if (source.kind === 'step') {
    const i = map.steps.findIndex((s) => s.id === source.id);
    return i < 0 ? undefined : { source, step: i + 1, title: map.steps[i].title, personaId: null };
  }
  const key = activityKeyOf(map, source.id);
  if (!key) return undefined;
  const [personaId, slot] = key.split(':');
  const i = map.steps.findIndex((s) => s.slots.includes(slot));
  return { source, step: i + 1, title: map.activities[key].text, personaId };
}

/** Links a flow to the part of a map it details, or unlinks it (null). */
export function setFlowSource(project: Project, flowDocId: Id, source: FlowSource | null): Project {
  return updateFlow(project, flowDocId, (f) => {
    if (!source) {
      if (!f.source) return f;
      const { source: _gone, ...rest } = f;
      return rest;
    }
    return { ...f, source };
  });
}

/** Sets a flow's main persona (null: none). */
export function setFlowPersona(flow: Flow, personaId: Id | null): Flow {
  if ((flow.personaId ?? null) === personaId) return flow;
  if (personaId) return { ...flow, personaId };
  const { personaId: _gone, ...rest } = flow;
  return rest;
}

/**
 * Adds `doc`, a new flow, as the detail of `source`: named after it, its
 * persona the activity's when it details one.
 */
export function addDetailFlow(project: Project, doc: FlowDoc, source: FlowSource): Project {
  const resolved = resolveSource(project, source);
  const name = resolved?.title.trim().replace(/\s+/g, ' ').slice(0, 60) || doc.name;
  const flow: Flow = { ...doc.flow, source, ...(resolved?.personaId ? { personaId: resolved.personaId } : {}) };
  return addDoc(project, { ...doc, name, flow });
}

/** The flows a map persona is in: as the flow's main persona or on one of its cards. */
export function personaFlows(project: Project, personaId: Id): FlowDoc[] {
  return project.docs.filter(
    (d): d is FlowDoc => d.kind === 'flow' && (d.flow.personaId === personaId || d.flow.nodes.some((n) => n.personaId === personaId)),
  );
}

/**
 * Applies `change`, a removal, then drops the links it left pointing at
 * nothing: a flow's source and personas, a sheet's persona. A sheet losing
 * its persona keeps the name, role and colour it showed until then.
 */
export function withLinksKept(project: Project, change: (project: Project) => Project): Project {
  const next = change(project);
  if (next === project) return project;
  const personaIds = new Set(next.docs.flatMap((d) => (d.kind === 'mission-map' ? d.map.personas.map((p) => p.id) : [])));
  const known = (id: Id | null | undefined) => !id || personaIds.has(id);
  let changed = false;
  const docs = next.docs.map((d) => {
    if (d.kind === 'persona') {
      if (!d.sheet.link || linkedPersona(next, d.sheet)) return d;
      changed = true;
      const before = project.docs.find((b): b is PersonaSheetDoc => b.id === d.id && b.kind === 'persona');
      const was = before?.sheet.sync ? linkedPersona(project, before.sheet) : undefined;
      const identity = was ? { name: was.persona.name, role: was.persona.role, color: was.persona.color } : {};
      return { ...d, sheet: { ...d.sheet, ...identity, link: null } };
    }
    if (d.kind !== 'flow') return d;
    let flow = d.flow;
    if (flow.source && !resolveSource(next, flow.source)) {
      const { source: _gone, ...rest } = flow;
      flow = rest;
    }
    if (!known(flow.personaId)) flow = setFlowPersona(flow, null);
    if (flow.nodes.some((n) => !known(n.personaId))) {
      flow = { ...flow, nodes: flow.nodes.map((n) => (known(n.personaId) ? n : { ...n, personaId: null })) };
    }
    if (flow === d.flow) return d;
    changed = true;
    return { ...d, flow };
  });
  return changed ? { ...next, docs } : next;
}

/** What else goes with a map persona: its sheet and the flows it is in. */
export function personaLinks(project: Project, mapDocId: Id, personaId: Id): { sheet: PersonaSheetDoc | undefined; flows: FlowDoc[] } {
  const elsewhere = project.docs.some((d) => d.kind === 'mission-map' && d.id !== mapDocId && d.map.personas.some((p) => p.id === personaId));
  return {
    sheet: project.docs.find((d): d is PersonaSheetDoc => d.kind === 'persona' && d.sheet.link?.docId === mapDocId && d.sheet.link.personaId === personaId),
    flows: elsewhere ? [] : personaFlows(project, personaId),
  };
}
