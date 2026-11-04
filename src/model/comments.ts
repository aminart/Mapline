// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Id, Project } from './types';
import { activityKey, altKey, setActivityNoteResolved } from './ops';
import { setNodeNoteResolved } from './flow';
import { updateFlow, updateMap } from './project';

/** Where a note sits: a mission map activity (by its key in `activities`) or a flow card. */
export type CommentTarget = { kind: 'act'; key: string; activityId: Id } | { kind: 'node'; nodeId: Id };

/** A note of the project, as listed in the comments panel. */
export interface Comment {
  docId: Id;
  docKind: 'mission-map' | 'flow';
  target: CommentTarget;
  /** The step and persona of a map activity; empty on a flow card. */
  stepTitle: string;
  stepIndex: number;
  persona: string;
  /** The card's own text. */
  card: string;
  note: string;
  resolved: boolean;
}

/** Every note of the project: document by document, in board order on maps, in reading order on flows. */
export function projectComments(project: Project): Comment[] {
  const out: Comment[] = [];
  for (const doc of project.docs) {
    if (doc.kind === 'mission-map') {
      const map = doc.map;
      map.steps.forEach((step, stepIndex) => {
        for (const persona of map.personas) {
          for (const slot of step.slots) {
            const key = activityKey(persona.id, slot);
            for (const k of [key, altKey(key)]) {
              const act = map.activities[k];
              if (!act?.note?.trim()) continue;
              out.push({
                docId: doc.id,
                docKind: 'mission-map',
                target: { kind: 'act', key: k, activityId: act.id },
                stepTitle: step.title,
                stepIndex,
                persona: persona.name,
                card: act.text.trim(),
                note: act.note.trim(),
                resolved: Boolean(act.noteResolved),
              });
            }
          }
        }
      });
    } else if (doc.kind === 'flow') {
      const nodes = doc.flow.nodes.filter((n) => n.note?.trim()).sort((a, b) => a.row - b.row || a.col - b.col);
      for (const n of nodes) {
        out.push({
          docId: doc.id,
          docKind: 'flow',
          target: { kind: 'node', nodeId: n.id },
          stepTitle: '',
          stepIndex: -1,
          persona: '',
          card: n.text.trim(),
          note: n.note!.trim(),
          resolved: Boolean(n.noteResolved),
        });
      }
    }
  }
  return out;
}

/** Marks a note of any document of the project as resolved, or open again. */
export function setCommentResolved(project: Project, docId: Id, target: CommentTarget, resolved: boolean): Project {
  return target.kind === 'act'
    ? updateMap(project, docId, (m) => setActivityNoteResolved(m, target.key, resolved))
    : updateFlow(project, docId, (f) => setNodeNoteResolved(f, target.nodeId, resolved));
}

/** The box key of the card a note is on, to select and focus it. */
export function commentBoxKey(target: CommentTarget): string {
  return target.kind === 'act' ? `act:${target.activityId}` : `node:${target.nodeId}`;
}
