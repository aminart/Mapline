// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Persona links: the personas of a project on one page, and how they relate
 * to one another (who manages whom, who asks whom, where it rubs). The
 * personas are those of the project's maps and sheets, referred to, never
 * copied: a persona renamed in its map shows its new name here.
 */

import type { BoxStyle, Id, PersonaLinks, PersonaNode, PersonaRef, PersonaZone, Project, Relation, RelationDash, RelationDir, RelationType } from './types';
import { sheetFor, sheetIdentity } from './project';
import { uid } from './ops';
import { translate, type Lang } from '../i18n';

/** Size of a persona's card, in pixels. */
export const NODE_W = 200;
export const NODE_H = 56;
/** Room left around the content of the page. */
export const PAGE_MARGIN = 40;
/** Room between two cards placed by Mapline. */
const GAP_X = 60;
const GAP_Y = 50;

export const RELATION_DASHES: RelationDash[] = ['solid', 'dashed', 'dotted', 'dashdot'];
export const RELATION_DIRS: RelationDir[] = ['to', 'both', 'none'];

/** The dash pattern of a line `width` pixels wide. */
export function dashArray(dash: RelationDash, width: number): number[] {
  const k = Math.max(1, width / 1.75);
  const base = { solid: [], dashed: [7, 5], dotted: [0.5, 4.5], dashdot: [9, 4, 1, 4] }[dash];
  return base.map((v) => Math.round(v * k * 10) / 10);
}

/** Width of a relation's line by strength. */
export function strokeWidth(strength: Relation['strength']): number {
  return [1.25, 1.25, 2, 3.25][strength ?? 2];
}

/** The five kinds of relation a new page starts with, named in `lang`; each can be renamed. */
export function defaultTypes(lang: Lang): RelationType[] {
  const t = (k: 'manages' | 'works' | 'asks' | 'influences' | 'tension') => translate(lang, `plinks.type.${k}`);
  return [
    { id: 'manages', name: t('manages'), color: '#2F55D4', dash: 'solid', dir: 'to' },
    { id: 'works', name: t('works'), color: '#3A3F4A', dash: 'solid', dir: 'none' },
    { id: 'asks', name: t('asks'), color: '#0F766E', dash: 'dashed', dir: 'to' },
    { id: 'influences', name: t('influences'), color: '#7E22CE', dash: 'dotted', dir: 'to' },
    { id: 'tension', name: t('tension'), color: '#C2410C', dash: 'dashdot', dir: 'none' },
  ];
}

/** A persona of the project as the page shows it. */
export interface PersonaInfo {
  ref: PersonaRef;
  name: string;
  role: string;
  color: number;
  style: BoxStyle | undefined;
  photo: string | null;
  /** Its sheet, when it has one. */
  sheetId: Id | null;
  /** The map it comes from (the first one holding it). */
  mapDocId: Id | null;
}

export const refKey = (ref: PersonaRef) => `${ref.kind}:${ref.id}`;

/**
 * Every persona of the project, once: those of its maps (a target state or a
 * copy shares its personas with its original), then its sheets that have no map.
 */
export function projectPersonaInfos(project: Project): PersonaInfo[] {
  const seen = new Set<Id>();
  const out: PersonaInfo[] = [];
  for (const d of project.docs) {
    if (d.kind !== 'mission-map') continue;
    for (const p of d.map.personas) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const sheet = sheetFor(project, d.id, p.id);
      out.push({
        ref: { kind: 'persona', id: p.id },
        name: p.name,
        role: p.role,
        color: p.color,
        style: d.map.styles[`persona:${p.id}`],
        photo: sheet?.sheet.photo ?? null,
        sheetId: sheet?.id ?? null,
        mapDocId: d.id,
      });
    }
  }
  for (const d of project.docs) {
    if (d.kind !== 'persona' || d.sheet.link) continue;
    const id = sheetIdentity(project, d.sheet);
    out.push({ ref: { kind: 'sheet', id: d.id }, name: id.name, role: id.role, color: id.color, style: undefined, photo: d.sheet.photo, sheetId: d.id, mapDocId: null });
  }
  return out;
}

/** The persona a node shows, or undefined once it is gone from the project. */
export function resolveRef(project: Project, ref: PersonaRef, infos = projectPersonaInfos(project)): PersonaInfo | undefined {
  return infos.find((p) => p.ref.kind === ref.kind && p.ref.id === ref.id);
}

/** The nodes whose persona still exists, with that persona. */
export function liveNodes(project: Project, links: PersonaLinks): { node: PersonaNode; info: PersonaInfo }[] {
  const infos = projectPersonaInfos(project);
  return links.nodes.flatMap((node) => {
    const info = resolveRef(project, node.ref, infos);
    return info ? [{ node, info }] : [];
  });
}

/** A new page, the project's personas already on it in rows, no relation yet. */
export function emptyPersonaLinks(lang: Lang, refs: PersonaRef[] = []): PersonaLinks {
  const links: PersonaLinks = { nodes: [], zones: [], relations: [], types: defaultTypes(lang) };
  return addNodes(links, refs).links;
}

/** Where a new card goes: the first free place in rows of four, left to right. */
export function freeSpot(links: PersonaLinks): { x: number; y: number } {
  const taken = (x: number, y: number) =>
    links.nodes.some((n) => Math.abs(n.x - x) < NODE_W + GAP_X / 2 && Math.abs(n.y - y) < NODE_H + GAP_Y / 2) ||
    links.zones.some((z) => x + NODE_W > z.x && x < z.x + z.w && y + NODE_H > z.y && y < z.y + z.h);
  for (let row = 0; row < 200; row++) {
    for (let col = 0; col < 4; col++) {
      const x = PAGE_MARGIN + col * (NODE_W + GAP_X);
      const y = PAGE_MARGIN + row * (NODE_H + GAP_Y);
      if (!taken(x, y)) return { x, y };
    }
  }
  return { x: PAGE_MARGIN, y: PAGE_MARGIN };
}

/** Adds personas not on the page yet, each in the next free place. */
export function addNodes(links: PersonaLinks, refs: PersonaRef[]): { links: PersonaLinks; ids: Id[] } {
  const ids: Id[] = [];
  let next = links;
  for (const ref of refs) {
    if (next.nodes.some((n) => refKey(n.ref) === refKey(ref))) continue;
    const at = freeSpot(next);
    const node: PersonaNode = { id: uid(), ref, ...at };
    ids.push(node.id);
    next = { ...next, nodes: [...next.nodes, node] };
  }
  return { links: next, ids };
}

/** Moves cards to new places (never above or left of the page). */
export function moveNodes(links: PersonaLinks, moves: Record<Id, { x: number; y: number }>): PersonaLinks {
  let changed = false;
  const nodes = links.nodes.map((n) => {
    const to = moves[n.id];
    if (!to) return n;
    const x = Math.max(0, Math.round(to.x));
    const y = Math.max(0, Math.round(to.y));
    if (x === n.x && y === n.y) return n;
    changed = true;
    return { ...n, x, y };
  });
  return changed ? { ...links, nodes } : links;
}

/** Takes a persona off the page, with its relations; it stays in the project. */
export function removeNode(links: PersonaLinks, id: Id): PersonaLinks {
  if (!links.nodes.some((n) => n.id === id)) return links;
  return { ...links, nodes: links.nodes.filter((n) => n.id !== id), relations: links.relations.filter((r) => r.from !== id && r.to !== id) };
}

/** Links two personas with a relation of `typeId`, going the way that type goes. */
export function addRelation(links: PersonaLinks, from: Id, to: Id, typeId: Id): { links: PersonaLinks; id: Id | null } {
  const type = links.types.find((t) => t.id === typeId) ?? links.types[0];
  if (!type || from === to || !links.nodes.some((n) => n.id === from) || !links.nodes.some((n) => n.id === to)) return { links, id: null };
  const relation: Relation = { id: uid(), from, to, type: type.id, dir: type.dir };
  return { links: { ...links, relations: [...links.relations, relation] }, id: relation.id };
}

export function setRelation(links: PersonaLinks, id: Id, patch: Partial<Omit<Relation, 'id' | 'from' | 'to'>>): PersonaLinks {
  const r = links.relations.find((x) => x.id === id);
  if (!r) return links;
  const next: Relation = { ...r, ...patch };
  if (patch.label !== undefined && !patch.label) delete next.label;
  if (next.strength === 2) delete next.strength;
  if (JSON.stringify(next) === JSON.stringify(r)) return links;
  return { ...links, relations: links.relations.map((x) => (x.id === id ? next : x)) };
}

/** Turns a relation round: from becomes to. */
export function swapRelation(links: PersonaLinks, id: Id): PersonaLinks {
  if (!links.relations.some((r) => r.id === id)) return links;
  return { ...links, relations: links.relations.map((r) => (r.id === id ? { ...r, from: r.to, to: r.from } : r)) };
}

export function removeRelation(links: PersonaLinks, id: Id): PersonaLinks {
  if (!links.relations.some((r) => r.id === id)) return links;
  return { ...links, relations: links.relations.filter((r) => r.id !== id) };
}

/** Adds a kind of relation, a colour of `palette` not taken yet if there is one. */
export function addType(links: PersonaLinks, name: string, palette: string[]): { links: PersonaLinks; id: Id } {
  const used = new Set(links.types.map((t) => t.color.toUpperCase()));
  const color = palette.find((c) => !used.has(c.toUpperCase())) ?? palette[0];
  const type: RelationType = { id: uid(), name, color, dash: 'solid', dir: 'to' };
  return { links: { ...links, types: [...links.types, type] }, id: type.id };
}

export function setType(links: PersonaLinks, id: Id, patch: Partial<Omit<RelationType, 'id'>>): PersonaLinks {
  const type = links.types.find((t) => t.id === id);
  if (!type || Object.entries(patch).every(([k, v]) => type[k as keyof RelationType] === v)) return links;
  return { ...links, types: links.types.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

/** Removes a kind of relation nothing uses; a page keeps at least one. */
export function removeType(links: PersonaLinks, id: Id): PersonaLinks {
  if (links.types.length <= 1 || links.relations.some((r) => r.type === id)) return links;
  return { ...links, types: links.types.filter((t) => t.id !== id) };
}

/** The personas whose card lies inside a zone (by its centre). */
export function nodesInZone(links: PersonaLinks, zone: PersonaZone): Id[] {
  return links.nodes
    .filter((n) => {
      const cx = n.x + NODE_W / 2;
      const cy = n.y + NODE_H / 2;
      return cx >= zone.x && cx <= zone.x + zone.w && cy >= zone.y && cy <= zone.y + zone.h;
    })
    .map((n) => n.id);
}

/** Adds a zone in the first free place under the cards, or around the cards `around`. */
export function addZone(links: PersonaLinks, title: string, around: Id[] = []): { links: PersonaLinks; id: Id } {
  const inside = links.nodes.filter((n) => around.includes(n.id));
  let rect: Omit<PersonaZone, 'id' | 'title'>;
  if (inside.length) {
    const x = Math.min(...inside.map((n) => n.x)) - 24;
    const y = Math.min(...inside.map((n) => n.y)) - 40;
    rect = { x: Math.max(0, x), y: Math.max(0, y), w: Math.max(...inside.map((n) => n.x + NODE_W)) + 24 - Math.max(0, x), h: Math.max(...inside.map((n) => n.y + NODE_H)) + 24 - Math.max(0, y) };
  } else {
    const bottom = Math.max(0, ...links.nodes.map((n) => n.y + NODE_H), ...links.zones.map((z) => z.y + z.h));
    rect = { x: PAGE_MARGIN, y: bottom + GAP_Y, w: 2 * NODE_W + GAP_X + 48, h: NODE_H + 96 };
  }
  const zone: PersonaZone = { id: uid(), title, ...rect };
  return { links: { ...links, zones: [...links.zones, zone] }, id: zone.id };
}

/** Moves or resizes a zone; moved, the personas inside it at the start (`carried`) go with it. */
export function setZone(links: PersonaLinks, id: Id, patch: Partial<Omit<PersonaZone, 'id'>>, carried: Id[] = []): PersonaLinks {
  const zone = links.zones.find((z) => z.id === id);
  if (!zone) return links;
  const next: PersonaZone = { ...zone, ...patch };
  next.x = Math.max(0, Math.round(next.x));
  next.y = Math.max(0, Math.round(next.y));
  next.w = Math.max(160, Math.round(next.w));
  next.h = Math.max(80, Math.round(next.h));
  const dx = next.x - zone.x;
  const dy = next.y - zone.y;
  if (JSON.stringify(next) === JSON.stringify(zone)) return links;
  const zones = links.zones.map((z) => (z.id === id ? next : z));
  const moved = (dx || dy) && patch.w === undefined && patch.h === undefined;
  const nodes = moved ? links.nodes.map((n) => (carried.includes(n.id) ? { ...n, x: Math.max(0, n.x + dx), y: Math.max(0, n.y + dy) } : n)) : links.nodes;
  return { ...links, zones, nodes };
}

export function removeZone(links: PersonaLinks, id: Id): PersonaLinks {
  if (!links.zones.some((z) => z.id === id)) return links;
  return { ...links, zones: links.zones.filter((z) => z.id !== id) };
}

/** How big the page is: its content and a margin. */
export function pageSize(links: PersonaLinks): { width: number; height: number } {
  const right = Math.max(0, ...links.nodes.map((n) => n.x + NODE_W), ...links.zones.map((z) => z.x + z.w));
  const bottom = Math.max(0, ...links.nodes.map((n) => n.y + NODE_H), ...links.zones.map((z) => z.y + z.h));
  return { width: right + PAGE_MARGIN, height: bottom + PAGE_MARGIN };
}

/** A relation's path between two cards: a straight line, or a curve when two relations join the same pair. */
export function relationPath(from: { x: number; y: number }, to: { x: number; y: number }, offset: number): { d: string; mid: { x: number; y: number }; start: { x: number; y: number }; end: { x: number; y: number } } {
  const a = { x: from.x + NODE_W / 2, y: from.y + NODE_H / 2 };
  const b = { x: to.x + NODE_W / 2, y: to.y + NODE_H / 2 };
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  const c = { x: (a.x + b.x) / 2 + nx * offset * 2, y: (a.y + b.y) / 2 + ny * offset * 2 };
  const start = edgePoint(a, offset ? c : b);
  const end = edgePoint(b, offset ? c : a);
  const mid = { x: 0.25 * start.x + 0.5 * c.x + 0.25 * end.x, y: 0.25 * start.y + 0.5 * c.y + 0.25 * end.y };
  const f = (n: number) => Math.round(n * 10) / 10;
  return { d: `M${f(start.x)} ${f(start.y)} Q${f(c.x)} ${f(c.y)} ${f(end.x)} ${f(end.y)}`, mid, start, end };
}

/** Where the line from a card's centre `c` towards `toward` leaves the card, a little outside it. */
export function edgePoint(c: { x: number; y: number }, toward: { x: number; y: number }, pad = 6): { x: number; y: number } {
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (!dx && !dy) return c;
  const s = Math.min((NODE_W / 2 + pad) / Math.abs(dx || 1e-9), (NODE_H / 2 + pad) / Math.abs(dy || 1e-9));
  return { x: c.x + dx * s, y: c.y + dy * s };
}

/** Offset of each relation from the straight line, so that two relations of a pair don't overlap. */
export function relationOffsets(relations: Relation[]): Map<Id, number> {
  const pairs = new Map<string, Relation[]>();
  for (const r of relations) {
    const key = [r.from, r.to].sort().join('|');
    pairs.set(key, [...(pairs.get(key) ?? []), r]);
  }
  const out = new Map<Id, number>();
  for (const list of pairs.values()) {
    list.forEach((r, i) => {
      const off = (i - (list.length - 1) / 2) * 34;
      // The same side whichever way the relation goes.
      out.set(r.id, r.from < r.to ? off : -off);
    });
  }
  return out;
}

/** Circles: `center` in the middle, its direct relations on a first ring, the others on a second. */
export function circlesLayout(links: PersonaLinks, center: Id, relations: Relation[]): { positions: Record<Id, { x: number; y: number }>; width: number; height: number; rings: { rx: number; ry: number }[] } {
  const ids = links.nodes.map((n) => n.id);
  const near = new Map<Id, Set<Id>>(ids.map((id) => [id, new Set()]));
  for (const r of relations) {
    near.get(r.from)?.add(r.to);
    near.get(r.to)?.add(r.from);
  }
  const dist = new Map<Id, number>([[center, 0]]);
  const queue = [center];
  while (queue.length) {
    const c = queue.shift()!;
    for (const n of near.get(c) ?? []) {
      if (!dist.has(n)) {
        dist.set(n, dist.get(c)! + 1);
        queue.push(n);
      }
    }
  }
  const first = ids.filter((id) => dist.get(id) === 1);
  const rest = ids.filter((id) => id !== center && dist.get(id) !== 1);
  // Rings wide enough for their cards side by side.
  const ring = (n: number, min: number) => Math.max(min, (n * (NODE_W + 30)) / (2 * Math.PI) * 1.3);
  const rx1 = ring(first.length, 280);
  const ry1 = Math.max(170, rx1 * 0.6);
  const rx2 = Math.max(rx1 + NODE_W + 40, ring(rest.length, 460));
  const ry2 = Math.max(ry1 + NODE_H + 70, rx2 * 0.6);
  const outer = rest.length ? { rx: rx2, ry: ry2 } : { rx: rx1, ry: ry1 };
  const cx = PAGE_MARGIN + outer.rx + NODE_W / 2;
  const cy = PAGE_MARGIN + 24 + outer.ry + NODE_H / 2;
  const positions: Record<Id, { x: number; y: number }> = { [center]: { x: cx - NODE_W / 2, y: cy - NODE_H / 2 } };
  const place = (list: Id[], rx: number, ry: number, start: number) =>
    list.forEach((id, k) => {
      const a = start + (k * 2 * Math.PI) / list.length;
      positions[id] = { x: Math.round(cx + Math.cos(a) * rx - NODE_W / 2), y: Math.round(cy + Math.sin(a) * ry - NODE_H / 2) };
    });
  place(first, rx1, ry1, -Math.PI / 2);
  place(rest, rx2, ry2, -Math.PI / 2 + Math.PI / Math.max(2, rest.length));
  return {
    positions,
    width: Math.round(cx + outer.rx + NODE_W / 2 + PAGE_MARGIN),
    height: Math.round(cy + outer.ry + NODE_H / 2 + PAGE_MARGIN + 24),
    rings: rest.length ? [{ rx: rx1, ry: ry1 }, { rx: rx2, ry: ry2 }] : [{ rx: rx1, ry: ry1 }],
  };
}

/** The persona with the most relations, to centre the circles on when none is chosen. */
export function busiestNode(links: PersonaLinks, relations: Relation[]): Id | null {
  let best: Id | null = null;
  let most = -1;
  for (const n of links.nodes) {
    const count = relations.filter((r) => r.from === n.id || r.to === n.id).length;
    if (count > most) {
      most = count;
      best = n.id;
    }
  }
  return best;
}

/** The steps of a map where a persona has a card. */
export interface MapSteps {
  docId: Id;
  steps: string[];
}

/** For each map persona, the steps of each map where it has activities, titled (or numbered). */
export function personaSteps(project: Project): Map<Id, MapSteps[]> {
  const out = new Map<Id, MapSteps[]>();
  for (const d of project.docs) {
    if (d.kind !== 'mission-map') continue;
    const stepOf = new Map<Id, number>();
    d.map.steps.forEach((s, i) => s.slots.forEach((slot) => stepOf.set(slot, i)));
    const byPersona = new Map<Id, Set<number>>();
    for (const [key, act] of Object.entries(d.map.activities)) {
      const [pid, slot] = key.split(':');
      const i = stepOf.get(slot);
      if (i === undefined || !act.text.trim()) continue;
      byPersona.set(pid, (byPersona.get(pid) ?? new Set()).add(i));
    }
    for (const [pid, steps] of byPersona) {
      const titles = [...steps].sort((a, b) => a - b).map((i) => d.map.steps[i].title.trim() || String(i + 1));
      out.set(pid, [...(out.get(pid) ?? []), { docId: d.id, steps: titles }]);
    }
  }
  return out;
}

/** The steps of each map where two personas both have activities. */
export function sharedSteps(steps: Map<Id, MapSteps[]>, a: PersonaRef, b: PersonaRef): MapSteps[] {
  if (a.kind !== 'persona' || b.kind !== 'persona') return [];
  const mine = steps.get(a.id) ?? [];
  const theirs = steps.get(b.id) ?? [];
  return mine.flatMap((m) => {
    const other = theirs.find((o) => o.docId === m.docId);
    const both = other ? m.steps.filter((s) => other.steps.includes(s)) : [];
    return both.length ? [{ docId: m.docId, steps: both }] : [];
  });
}

/** Pairs of personas of the page without a relation that share steps of a map: suggested relations. */
export function suggestions(project: Project, links: PersonaLinks): { from: Id; to: Id; shared: MapSteps[] }[] {
  const steps = personaSteps(project);
  const linked = new Set(links.relations.map((r) => [r.from, r.to].sort().join('|')));
  const out: { from: Id; to: Id; shared: MapSteps[] }[] = [];
  links.nodes.forEach((a, i) =>
    links.nodes.slice(i + 1).forEach((b) => {
      if (linked.has([a.id, b.id].sort().join('|'))) return;
      const shared = sharedSteps(steps, a.ref, b.ref);
      if (shared.length) out.push({ from: a.id, to: b.id, shared });
    }),
  );
  return out;
}

/**
 * After a change to the project: a persona whose map is gone but whose sheet
 * stays is now that sheet on every page.
 */
export function rehomeNodes(before: Project, after: Project): Project {
  const moved = new Map<Id, Id>();
  for (const d of after.docs) {
    if (d.kind !== 'persona' || d.sheet.link) continue;
    const was = before.docs.find((b) => b.id === d.id);
    if (was?.kind === 'persona' && was.sheet.link) moved.set(was.sheet.link.personaId, d.id);
  }
  if (moved.size === 0) return after;
  const still = new Set(after.docs.flatMap((d) => (d.kind === 'mission-map' ? d.map.personas.map((p) => p.id) : [])));
  let changed = false;
  const docs = after.docs.map((d) => {
    if (d.kind !== 'persona-links') return d;
    let touched = false;
    const nodes = d.links.nodes.map((n) => {
      const sheet = n.ref.kind === 'persona' && !still.has(n.ref.id) ? moved.get(n.ref.id) : undefined;
      if (!sheet) return n;
      touched = true;
      return { ...n, ref: { kind: 'sheet' as const, id: sheet } };
    });
    if (!touched) return d;
    changed = true;
    return { ...d, links: { ...d.links, nodes } };
  });
  return changed ? { ...after, docs } : after;
}

/** Relations of the persona of a sheet, on every page of the project, for its sheet. */
export function sheetRelations(project: Project, sheetDocId: Id): { docId: Id; relation: Relation; other: PersonaInfo; outgoing: boolean; type: RelationType | undefined }[] {
  const sheet = project.docs.find((d) => d.id === sheetDocId);
  if (sheet?.kind !== 'persona') return [];
  const mine = (ref: PersonaRef) => (ref.kind === 'sheet' ? ref.id === sheetDocId : ref.id === sheet.sheet.link?.personaId);
  const infos = projectPersonaInfos(project);
  return project.docs.flatMap((d) => {
    if (d.kind !== 'persona-links') return [];
    const me = d.links.nodes.find((n) => mine(n.ref));
    if (!me) return [];
    return d.links.relations.flatMap((relation) => {
      if (relation.from !== me.id && relation.to !== me.id) return [];
      const otherNode = d.links.nodes.find((n) => n.id === (relation.from === me.id ? relation.to : relation.from));
      const other = otherNode ? resolveRef(project, otherNode.ref, infos) : undefined;
      if (!other) return [];
      return [{ docId: d.id, relation, other, outgoing: relation.from === me.id, type: d.links.types.find((t) => t.id === relation.type) }];
    });
  });
}
