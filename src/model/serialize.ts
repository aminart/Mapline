// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import type { BlockView, Blueprint, Flow, FlowNode, FlowNodeKind, LinkStyle, PersonaSheet, Project, ProjectDoc, SheetBlock } from './types';
import { normalizePhases, uid } from './ops';
import { PROJECT_VERSION } from './project';

export const FILE_EXTENSION = 'mapline';
/** Extensions a project can be opened from: files saved before Mapline was renamed included. */
export const OPEN_EXTENSIONS = [FILE_EXTENSION, 'missionmap'];

/** A file that can't be opened; `reason` maps to a translated message. */
export class ProjectFileError extends Error {
  constructor(readonly reason: 'invalid' | 'newer') {
    super(reason);
  }
}

export function serialize(project: Project): string {
  return JSON.stringify(project, null, 2);
}

type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Parses a project file, filling in anything missing. Files from before
 * version 0.10 hold a single mission map and are read as a project with one
 * document. Throws on invalid input.
 */
export function parse(text: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectFileError('invalid');
  }
  if (!isObject(raw)) throw new ProjectFileError('invalid');
  const version = raw.version;
  if (typeof version === 'number' && version > PROJECT_VERSION) throw new ProjectFileError('newer');
  if (version === undefined || version === 1) {
    // Version 1: the file is the mission map itself, titled.
    return { version: PROJECT_VERSION, title: String(raw.title ?? ''), docs: [{ id: uid(), kind: 'mission-map', name: '', map: parseMap(raw) }] };
  }
  if (!Array.isArray(raw.docs) || raw.docs.length === 0) throw new ProjectFileError('invalid');
  return { version: PROJECT_VERSION, title: String(raw.title ?? ''), docs: raw.docs.map(parseDoc) };
}

function parseDoc(raw: unknown): ProjectDoc {
  if (!isObject(raw)) throw new ProjectFileError('invalid');
  const base = { id: typeof raw.id === 'string' && raw.id ? raw.id : uid(), name: String(raw.name ?? '') };
  switch (raw.kind) {
    case 'mission-map':
      return { ...base, kind: 'mission-map', map: parseMap(raw.map) };
    case 'persona':
      return { ...base, kind: 'persona', sheet: parseSheet(raw.sheet) };
    case 'flow':
      return { ...base, kind: 'flow', flow: parseFlow(raw.flow) };
    default:
      // A kind of document this version doesn't know: made by a newer app.
      throw new ProjectFileError('newer');
  }
}

function parseMap(input: unknown): Blueprint {
  if (!isObject(input)) throw new ProjectFileError('invalid');
  const raw = input as Partial<Blueprint>;
  if (!Array.isArray(raw.steps) || !Array.isArray(raw.personas)) throw new ProjectFileError('invalid');
  const steps = raw.steps.map((s) => ({
    id: String(s.id),
    title: String(s.title ?? ''),
    slots: Array.isArray(s.slots) && s.slots.length > 0 ? s.slots.map(String) : [`${s.id}-0`],
  }));
  return {
    objective: String(raw.objective ?? ''),
    phases: normalizePhases(Array.isArray(raw.phases) ? raw.phases : [], steps.length),
    steps,
    personas: raw.personas.map((p, i) => ({
      id: String(p.id),
      name: String(p.name ?? ''),
      role: String(p.role ?? ''),
      color: typeof p.color === 'number' ? p.color : i,
    })),
    activities: raw.activities ?? {},
    scenes: raw.scenes ?? {},
    links: Array.isArray(raw.links) ? raw.links : [],
    dividers: Array.isArray(raw.dividers) ? raw.dividers : [],
    tagColors: raw.tagColors && typeof raw.tagColors === 'object' ? raw.tagColors : {},
    styles: raw.styles ?? {},
    storyboard: Boolean(raw.storyboard),
    infos: raw.infos && typeof raw.infos === 'object' ? raw.infos : {},
    infoRow: Boolean(raw.infoRow),
    ...(typeof raw.infoTitle === 'string' ? { infoTitle: raw.infoTitle } : {}),
    ...(typeof raw.infoText === 'string' ? { infoText: raw.infoText } : {}),
  };
}

/** A tag colour map, when the file has one: index per lower-cased tag. */
function tagColorsOf(v: unknown): { tagColors?: Record<string, number> } {
  if (!isObject(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v)) if (typeof n === 'number' && Number.isInteger(n) && n >= 0) out[k] = n;
  return { tagColors: out };
}

const VIEWS: BlockView[] = ['list', 'gauges', 'tags', 'text'];
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const id = (v: unknown) => (typeof v === 'string' && v ? v : uid());

function parseSheet(input: unknown): PersonaSheet {
  if (!isObject(input)) throw new ProjectFileError('invalid');
  const raw = input;
  const link = isObject(raw.link) && typeof raw.link.docId === 'string' && typeof raw.link.personaId === 'string'
    ? { docId: raw.link.docId, personaId: raw.link.personaId }
    : null;
  return {
    name: str(raw.name),
    role: str(raw.role),
    color: typeof raw.color === 'number' ? raw.color : 0,
    photo: typeof raw.photo === 'string' && raw.photo.startsWith('data:image/') ? raw.photo : null,
    fields: (Array.isArray(raw.fields) ? raw.fields : []).filter(isObject).map((f) => ({ id: id(f.id), label: str(f.label), value: str(f.value) })),
    quote: str(raw.quote),
    tags: (Array.isArray(raw.tags) ? raw.tags : []).filter((t): t is string => typeof t === 'string'),
    ...tagColorsOf(raw.tagColors),
    blocks: (Array.isArray(raw.blocks) ? raw.blocks : []).filter(isObject).map(parseBlock),
    styles: isObject(raw.styles) ? (raw.styles as PersonaSheet['styles']) : {},
    link,
    sync: link ? raw.sync !== false : false,
  };
}

function parseBlock(raw: Record<string, unknown>): SheetBlock {
  const view = VIEWS.includes(raw.view as BlockView) ? (raw.view as BlockView) : 'list';
  return {
    id: id(raw.id),
    title: str(raw.title),
    view,
    accent: typeof raw.accent === 'string' && /^#[0-9a-f]{6}$/i.test(raw.accent) ? raw.accent : '#2F55D4',
    items: (Array.isArray(raw.items) ? raw.items : []).filter(isObject).map((i) => ({
      id: id(i.id),
      text: str(i.text),
      ...(typeof i.level === 'number' ? { level: Math.max(0, Math.min(100, i.level)) } : {}),
    })),
    text: str(raw.text),
  };
}

const NODE_KINDS: FlowNodeKind[] = ['start', 'end', 'activity', 'choice'];
const LINK_STYLES: LinkStyle[] = ['solid', 'dashed', 'dotted'];
const cellIndex = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

function parseFlow(input: unknown): Flow {
  if (!isObject(input)) throw new ProjectFileError('invalid');
  const taken = new Set<string>();
  const nodes: FlowNode[] = [];
  for (const n of (Array.isArray(input.nodes) ? input.nodes : []).filter(isObject)) {
    const node: FlowNode = {
      id: id(n.id),
      kind: NODE_KINDS.includes(n.kind as FlowNodeKind) ? (n.kind as FlowNodeKind) : 'activity',
      col: cellIndex(n.col),
      row: cellIndex(n.row),
      text: str(n.text),
      ...(typeof n.personaId === 'string' ? { personaId: n.personaId } : {}),
      ...(Array.isArray(n.tags) ? { tags: n.tags.filter((t): t is string => typeof t === 'string') } : {}),
      ...(typeof n.note === 'string' && n.note ? { note: n.note } : {}),
    };
    // Two cards in one cell can't be shown: the later one is dropped.
    const cell = `${node.col}:${node.row}`;
    if (taken.has(cell)) continue;
    taken.add(cell);
    nodes.push(node);
  }
  const ids = new Set(nodes.map((n) => n.id));
  const links = (Array.isArray(input.links) ? input.links : [])
    .filter(isObject)
    .filter((l) => typeof l.from === 'string' && typeof l.to === 'string' && ids.has(l.from) && ids.has(l.to))
    .map((l) => ({
      id: id(l.id),
      from: l.from as string,
      to: l.to as string,
      ...(typeof l.label === 'string' && l.label ? { label: l.label } : {}),
      ...(LINK_STYLES.includes(l.style as LinkStyle) ? { style: l.style as LinkStyle } : {}),
      ...(typeof l.color === 'string' && /^#[0-9a-f]{6}$/i.test(l.color) ? { color: l.color } : {}),
    }));
  return { nodes, links, styles: isObject(input.styles) ? (input.styles as Flow['styles']) : {}, ...tagColorsOf(input.tagColors) };
}
