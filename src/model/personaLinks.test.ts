// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import * as pl from './personaLinks';
import { exampleProject } from './fixtures';
import { parse, serialize } from './serialize';
import { addDoc, removeDoc } from './project';
import { withLinksKept } from './links';
import { createPersonaLinksDoc, createSheet, sheetDoc } from './templates';
import type { PersonaLinks, PersonaLinksDoc, Project } from './types';

/** The example project (Patient, Secrétaire, Praticien), a sheet for its patient, one without a map, and a page with all of them. */
function sample(): { project: Project; page: PersonaLinksDoc } {
  let project = exampleProject();
  const map = project.docs[0];
  if (map.kind !== 'mission-map') throw new Error('map');
  const [patient] = map.map.personas;
  project = addDoc(project, sheetDoc(createSheet('blank', 'fr', { persona: patient, mapDocId: map.id })));
  project = addDoc(project, sheetDoc({ ...createSheet('blank', 'fr'), name: 'Aidant', role: 'Fils du patient' }));
  const page = createPersonaLinksDoc('fr', pl.projectPersonaInfos(project).map((p) => p.ref));
  return { project: addDoc(project, page), page };
}

const pageOf = (project: Project, id: string): PersonaLinks => {
  const d = project.docs.find((x) => x.id === id);
  if (d?.kind !== 'persona-links') throw new Error('page');
  return d.links;
};

describe('persona links', () => {
  it('starts with every persona of the project, once, in rows, and five kinds of link in French', () => {
    const { project, page } = sample();
    const names = pl.liveNodes(project, page.links).map((l) => l.info.name);
    expect(names).toEqual(['Patient', 'Secrétaire', 'Praticien', 'Aidant']);
    expect(page.links.types.map((t) => t.name)).toEqual(['Encadre', 'Collabore avec', 'Sollicite', 'Influence', 'Tension']);
    const ys = new Set(page.links.nodes.map((n) => n.y));
    expect(ys.size).toBe(1);
    // A persona already on the page is not added twice.
    expect(pl.addNodes(page.links, [page.links.nodes[0].ref]).ids).toEqual([]);
    // The patient's sheet is known, the map persona not doubled by it.
    expect(pl.liveNodes(project, page.links)[0].info.sheetId).not.toBeNull();
  });

  it('links two personas the way their kind goes, then edits, turns and removes the link', () => {
    const { page } = sample();
    const [a, b] = page.links.nodes.map((n) => n.id);
    let m = pl.addRelation(page.links, a, b, 'asks').links;
    expect(pl.addRelation(m, a, a, 'asks').id).toBeNull();
    const r = m.relations[0];
    expect(r).toMatchObject({ from: a, to: b, type: 'asks', dir: 'to' });
    expect(pl.addRelation(m, a, b, 'works').links.relations[1].dir).toBe('none');
    m = pl.setRelation(m, r.id, { label: 'Prend ses RDV', strength: 3 });
    expect(m.relations[0]).toMatchObject({ label: 'Prend ses RDV', strength: 3 });
    m = pl.setRelation(m, r.id, { label: '', strength: 2 });
    expect(m.relations[0].label).toBeUndefined();
    expect(m.relations[0].strength).toBeUndefined();
    m = pl.swapRelation(m, r.id);
    expect(m.relations[0]).toMatchObject({ from: b, to: a });
    // A persona taken off the page takes its links with it.
    expect(pl.removeNode(m, a).relations).toEqual([]);
  });

  it('adds and renames kinds of link; one in use, or the last one, stays', () => {
    const { page } = sample();
    const [a, b] = page.links.nodes.map((n) => n.id);
    let m = pl.addType(page.links, 'Remplace', ['#2F55D4', '#B42318']).links;
    const added = m.types[5];
    expect(added).toMatchObject({ name: 'Remplace', color: '#B42318' });
    m = pl.setType(m, 'tension', { name: 'Frictions' });
    expect(m.types[4].name).toBe('Frictions');
    m = pl.addRelation(m, a, b, 'tension').links;
    expect(pl.removeType(m, 'tension')).toBe(m);
    expect(pl.removeType(m, added.id).types).toHaveLength(5);
    const one = { ...m, types: [m.types[0]], relations: [] };
    expect(pl.removeType(one, m.types[0].id)).toBe(one);
  });

  it('moves a zone with the personas inside it, resizes it alone', () => {
    const { page } = sample();
    const first = page.links.nodes[0];
    let m = pl.addZone(page.links, 'Cabinet', [first.id]).links;
    const zone = m.zones[0];
    expect(pl.nodesInZone(m, zone)).toEqual([first.id]);
    m = pl.setZone(m, zone.id, { x: zone.x + 100, y: zone.y + 50 }, [first.id]);
    expect(m.nodes[0]).toMatchObject({ x: first.x + 100, y: first.y + 50 });
    expect(m.nodes[1]).toEqual(page.links.nodes[1]);
    const resized = pl.setZone(m, zone.id, { w: 10, h: 10 }, [first.id]);
    expect(resized.zones[0]).toMatchObject({ w: 160, h: 80 });
    expect(resized.nodes[0]).toEqual(m.nodes[0]);
  });

  it('lays out circles: the centre in the middle, its links on the first ring, the rest on the second', () => {
    const { page } = sample();
    const [a, b, c, d] = page.links.nodes.map((n) => n.id);
    let m = pl.addRelation(page.links, a, b, 'works').links;
    m = pl.addRelation(m, b, c, 'works').links;
    const { positions, rings } = pl.circlesLayout(m, a, m.relations);
    expect(rings).toHaveLength(2);
    const centre = { x: positions[a].x + pl.NODE_W / 2, y: positions[a].y + pl.NODE_H / 2 };
    const dist = (id: string) => {
      const p = { x: positions[id].x + pl.NODE_W / 2 - centre.x, y: positions[id].y + pl.NODE_H / 2 - centre.y };
      return (p.x / rings[0].rx) ** 2 + (p.y / rings[0].ry) ** 2;
    };
    expect(dist(b)).toBeCloseTo(1, 1);
    expect(dist(c)).toBeGreaterThan(1.2);
    expect(dist(d)).toBeGreaterThan(1.2);
    expect(Object.values(positions).every((p) => p.x >= 0 && p.y >= 0)).toBe(true);
  });

  it('suggests links between personas sharing steps of a map, not between those already linked', () => {
    const { project, page } = sample();
    const nodes = pl.liveNodes(project, page.links);
    const patient = nodes.find((n) => n.info.name === 'Patient')!.node.id;
    const secretary = nodes.find((n) => n.info.name === 'Secrétaire')!.node.id;
    const found = pl.suggestions(project, page.links).find((s) => [s.from, s.to].sort().join() === [patient, secretary].sort().join());
    expect(found?.shared[0].steps.length).toBeGreaterThan(0);
    const linked = pl.addRelation(page.links, patient, secretary, 'asks').links;
    expect(pl.suggestions(project, linked).some((s) => [s.from, s.to].includes(patient) && [s.from, s.to].includes(secretary))).toBe(false);
  });

  it('keeps a persona whose map is removed as its sheet, and lists its links on the sheet', () => {
    const { project, page } = sample();
    const nodes = pl.liveNodes(project, page.links);
    const patient = nodes.find((n) => n.info.name === 'Patient')!;
    const aidant = nodes.find((n) => n.info.name === 'Aidant')!.node.id;
    const linked = { ...project, docs: project.docs.map((d) => (d.id === page.id ? { ...page, links: pl.addRelation(page.links, aidant, patient.node.id, 'influences').links } : d)) };
    const sheetId = patient.info.sheetId!;
    expect(pl.sheetRelations(linked, sheetId).map((r) => [r.other.name, r.outgoing, r.type?.name])).toEqual([['Aidant', false, 'Influence']]);
    // Another map is needed: a project keeps at least one document, which it has anyway.
    const after = withLinksKept(linked, (p) => removeDoc(p, project.docs[0].id));
    const node = pageOf(after, page.id).nodes.find((n) => n.id === patient.node.id)!;
    expect(node.ref).toEqual({ kind: 'sheet', id: sheetId });
    expect(pl.liveNodes(after, pageOf(after, page.id)).map((l) => l.info.name)).toContain('Patient');
    expect(pl.sheetRelations(after, sheetId)).toHaveLength(1);
  });

  it('is saved and read back; links to personas not on the page, or of no known kind, are dropped', () => {
    const { project, page } = sample();
    const [a, b] = page.links.nodes.map((n) => n.id);
    const links = pl.addZone(pl.setRelation(pl.addRelation(page.links, a, b, 'tension').links, '', {}), 'Cabinet').links;
    const withRel = { ...links, relations: [...links.relations, { id: 'x', from: a, to: 'gone', type: 'works', dir: 'none' as const }, { id: 'y', from: a, to: b, type: 'nope', dir: 'to' as const }] };
    const saved = { ...project, docs: project.docs.map((d) => (d.id === page.id ? { ...page, links: withRel } : d)) };
    const read = pageOf(parse(serialize(saved)), page.id);
    expect(read).toEqual(links);
  });

  it('draws two links between the same personas apart, the same side whichever way they go', () => {
    const offsets = pl.relationOffsets([
      { id: 'r1', from: 'a', to: 'b', type: 't', dir: 'to' },
      { id: 'r2', from: 'b', to: 'a', type: 't', dir: 'to' },
      { id: 'r3', from: 'a', to: 'c', type: 't', dir: 'to' },
    ]);
    expect(offsets.get('r3')).toBe(0);
    expect(offsets.get('r1')).toBe(-17);
    expect(offsets.get('r2')).toBe(-17);
    const straight = pl.relationPath({ x: 0, y: 0 }, { x: 400, y: 0 }, 0);
    expect(straight.start.x).toBeCloseTo(pl.NODE_W + 6);
    expect(straight.end.x).toBeCloseTo(400 - 6);
  });
});
