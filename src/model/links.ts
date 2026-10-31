// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Links between a project's documents: a flow details a phase, a step or an
 * activity of a mission map, and has a main persona; a persona's sheet links
 * to the flows that persona is in.
 */

import type { Flow, FlowDoc, FlowSource, Id, Project } from './types';
import { activityKeyOf, normalizePhases } from './ops';
import { addDoc, missionMapOf, updateFlow } from './project';

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

/** The persona a flow card is coloured by: its own, else the flow's main persona. */
export function nodePersona(flow: Flow, personaId: Id | null | undefined): Id | undefined {
  return personaId ?? flow.personaId ?? undefined;
}

/** The flows a map persona is in: as the flow's main persona or on one of its cards. */
export function personaFlows(project: Project, personaId: Id): FlowDoc[] {
  return project.docs.filter(
    (d): d is FlowDoc => d.kind === 'flow' && (d.flow.personaId === personaId || d.flow.nodes.some((n) => n.personaId === personaId)),
  );
}
