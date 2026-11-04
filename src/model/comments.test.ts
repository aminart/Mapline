// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { exampleProject } from './fixtures';
import { commentBoxKey, projectComments, setCommentResolved } from './comments';
import { setActivityNote } from './ops';
import { setNodeNote } from './flow';
import { addDoc, updateMap } from './project';
import { parse, serialize } from './serialize';
import type { FlowDoc, Project } from './types';

function withNotes(): Project {
  let project = exampleProject();
  const mapId = project.docs[0].id;
  const map = project.docs[0].kind === 'mission-map' ? project.docs[0].map : null!;
  const keys = Object.keys(map.activities);
  project = updateMap(project, mapId, (m) => setActivityNote(setActivityNote(m, keys[3], 'Vérifier le délai'), keys[0], 'Source : entretiens'));
  const flow: FlowDoc = {
    id: 'flow1',
    kind: 'flow',
    name: 'Réserver',
    flow: {
      nodes: [
        { id: 'n2', kind: 'activity', col: 2, row: 0, text: 'Payer', note: 'Quel moyen ?' },
        { id: 'n1', kind: 'activity', col: 1, row: 0, text: 'Choisir', note: 'Trop de choix' },
      ],
      links: [],
      styles: {},
    },
  };
  return addDoc(project, flow);
}

describe('comments panel', () => {
  it('lists every note of the project, map by board order then flows by reading order', () => {
    const list = projectComments(withNotes());
    expect(list.map((c) => c.note)).toEqual(['Source : entretiens', 'Vérifier le délai', 'Trop de choix', 'Quel moyen ?']);
    expect(list[0]).toMatchObject({ docKind: 'mission-map', stepTitle: 'Découverte', persona: 'Patient', resolved: false });
    expect(list[2]).toMatchObject({ docKind: 'flow', docId: 'flow1', card: 'Choisir' });
    expect(commentBoxKey(list[2].target)).toBe('node:n1');
  });

  it('marks notes resolved and open again, and keeps the mark in the file', () => {
    let project = withNotes();
    const [first, , flowNote] = projectComments(project);
    project = setCommentResolved(project, first.docId, first.target, true);
    project = setCommentResolved(project, flowNote.docId, flowNote.target, true);
    expect(projectComments(project).map((c) => c.resolved)).toEqual([true, false, true, false]);
    const back = parse(serialize(project));
    expect(projectComments(back).map((c) => c.resolved)).toEqual([true, false, true, false]);
    // Marking it again changes nothing.
    expect(setCommentResolved(project, first.docId, first.target, true)).toBe(project);
    project = setCommentResolved(project, first.docId, first.target, false);
    expect(projectComments(project)[0].resolved).toBe(false);
  });

  it('drops the resolved mark with the note, and keeps it while the note is edited', () => {
    let project = withNotes();
    const [first, , flowNote] = projectComments(project);
    project = setCommentResolved(project, first.docId, first.target, true);
    project = setCommentResolved(project, flowNote.docId, flowNote.target, true);
    const key = first.target.kind === 'act' ? first.target.key : '';
    project = updateMap(project, first.docId, (m) => setActivityNote(m, key, 'Source : entretiens, mars'));
    expect(projectComments(project)[0].resolved).toBe(true);
    project = updateMap(project, first.docId, (m) => setActivityNote(m, key, ''));
    const doc = project.docs[0];
    if (doc.kind !== 'mission-map') throw new Error('not a map');
    expect(Object.values(doc.map.activities).some((a) => a.noteResolved)).toBe(false);
    const flow = project.docs.find((d): d is FlowDoc => d.kind === 'flow')!;
    const cleared = setNodeNote(flow.flow, 'n1', '');
    expect(cleared.nodes.find((n) => n.id === 'n1')).not.toHaveProperty('noteResolved');
  });
});
