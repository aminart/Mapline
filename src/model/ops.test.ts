// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import * as ops from './ops';
import { exampleBlueprint } from './fixtures';
import { TEMPLATES, createMap } from './templates';
import { ProjectFileError, parse, serialize } from './serialize';
import { projectFromMap } from './project';
import type { Blueprint, MissionMapDoc } from './types';

/** A mission map saved in a project file and read back. */
function roundTrip(map: Blueprint): Blueprint {
  return (parse(serialize(projectFromMap('Test', map))).docs[0] as MissionMapDoc).map;
}

function spans(doc: Blueprint) {
  return ops.normalizePhases(doc.phases, doc.steps.length).map((p) => p.span);
}

describe('steps', () => {
  it('inserting a step in the middle keeps activities attached to their step', () => {
    const doc = exampleBlueprint();
    const before = doc.steps.map((s) => s.id);
    const acts = { ...doc.activities };
    const { doc: next, stepId } = ops.insertStep(doc, 2);
    expect(next.steps.map((s) => s.id)).toEqual([...before.slice(0, 2), stepId, ...before.slice(2)]);
    expect(next.activities).toEqual(acts);
    expect(next.links).toEqual(doc.links);
  });

  it('a new step joins the phase it is inserted into', () => {
    const doc = exampleBlueprint(); // spans 3, 1, 1
    expect(spans(ops.insertStep(doc, 1).doc)).toEqual([4, 1, 1]);
    expect(spans(ops.insertStep(doc, 3).doc)).toEqual([3, 2, 1]);
    expect(spans(ops.insertStep(doc, doc.steps.length).doc)).toEqual([3, 1, 2]);
  });

  it('removing the only step of a phase removes the phase and orphaned data', () => {
    const doc = exampleBlueprint();
    const next = ops.removeStep(doc, 4); // "Suivi", alone in "Après"
    expect(spans(next)).toEqual([3, 1]);
    expect(next.phases).toHaveLength(2);
    const slot = doc.steps[4].slots[0];
    expect(Object.keys(next.activities).some((k) => k.endsWith(`:${slot}`))).toBe(false);
    // The arrow into "Reçoit son compte-rendu" went with it.
    expect(next.links).toHaveLength(doc.links.length - 1);
  });
});

describe('slots (activities side by side)', () => {
  it('adds a column right after the given one, with an activity for the persona', () => {
    const doc = exampleBlueprint();
    const step = doc.steps[0];
    const persona = doc.personas[1];
    const { doc: next, activityId } = ops.addSlot(doc, step.id, step.slots[0], persona.id);
    const slots = next.steps[0].slots;
    expect(slots).toHaveLength(2);
    expect(slots[0]).toBe(step.slots[0]);
    expect(next.activities[ops.activityKey(persona.id, slots[1])].id).toBe(activityId);
    expect(ops.columns(next)).toHaveLength(ops.columns(doc).length + 1);
  });

  it('never removes the last column of a step', () => {
    const doc = exampleBlueprint();
    expect(ops.removeLastSlot(doc, doc.steps[0].id).steps[0].slots).toHaveLength(1);
    const two = ops.removeLastSlot(doc, doc.steps[1].id);
    expect(two.steps[1].slots).toHaveLength(1);
  });
});

describe('phases', () => {
  it('moves a phase edge and keeps spans summing to the step count', () => {
    const doc = exampleBlueprint();
    expect(spans(ops.movePhaseEdge(doc, 0, -1))).toEqual([2, 2, 1]);
    expect(spans(ops.movePhaseEdge(doc, 0, 1))).toEqual([4, 1]);
    expect(spans(ops.movePhaseEdge(doc, 2, 1))).toEqual([3, 1, 1]);
  });

  it('adds a phase by splitting the last one, or with a new step', () => {
    const doc = exampleBlueprint();
    const added = ops.addPhase(doc);
    expect(added.steps).toHaveLength(6);
    expect(spans(added)).toEqual([3, 1, 1, 1]);
    const merged = ops.removePhase(doc, 1);
    expect(spans(merged)).toEqual([4, 1]);
    expect(spans(ops.addPhase(merged))).toEqual([4, 1, 1]);
  });

  it('normalizes broken spans', () => {
    expect(ops.normalizePhases([{ id: 'a', title: '', span: 10 }], 3).map((p) => p.span)).toEqual([3]);
    expect(
      ops.normalizePhases(
        [
          { id: 'a', title: '', span: 1 },
          { id: 'b', title: '', span: 1 },
        ],
        5,
      ).map((p) => p.span),
    ).toEqual([1, 4]);
  });
});

describe('links', () => {
  it('toggles an arrow and drops arrows of deleted activities', () => {
    const doc = exampleBlueprint();
    const [a, b] = Object.values(doc.activities);
    const on = ops.toggleLink(doc, b.id, a.id);
    expect(on.links).toHaveLength(doc.links.length + 1);
    expect(ops.toggleLink(on, b.id, a.id).links).toHaveLength(doc.links.length);
    const key = Object.keys(doc.activities).find((k) => doc.activities[k].id === a.id)!;
    const removed = ops.removeActivity(on, key);
    expect(removed.links.some((l) => l.from === a.id || l.to === a.id)).toBe(false);
  });

  it('removing a persona removes its activities and arrows', () => {
    const doc = exampleBlueprint();
    const next = ops.removePersona(doc, doc.personas[1].id);
    expect(Object.keys(next.activities).some((k) => k.startsWith(doc.personas[1].id))).toBe(false);
    expect(next.links.length).toBeLessThan(doc.links.length);
  });
});

describe('tags', () => {
  it('adds trimmed tags once and removes them', () => {
    const doc = exampleBlueprint();
    const key = Object.keys(doc.activities)[0];
    let next = ops.addTag(doc, key, '  irritant  ');
    next = ops.addTag(next, key, 'Irritant');
    next = ops.addTag(next, key, '   ');
    next = ops.addTag(next, key, 'email');
    expect(next.activities[key].tags).toEqual(['irritant', 'email']);
    expect(ops.allTags(next)).toEqual(['email', 'irritant']);
    expect(ops.removeTag(next, key, 'irritant').activities[key].tags).toEqual(['email']);
    expect(roundTrip(next).activities[key].tags).toEqual(['irritant', 'email']);
  });
});

describe('drag and drop', () => {
  it('moves an activity to an empty cell, or swaps with an occupied one', () => {
    const doc = exampleBlueprint();
    const [patient, secretary] = doc.personas;
    const from = ops.activityKey(patient.id, doc.steps[0].slots[0]);
    const empty = ops.activityKey(secretary.id, doc.steps[0].slots[0]);
    const moved = ops.moveActivity(doc, from, empty);
    expect(moved.activities[from]).toBeUndefined();
    expect(moved.activities[empty].id).toBe(doc.activities[from].id);

    const occupied = ops.activityKey(patient.id, doc.steps[2].slots[0]);
    const swapped = ops.moveActivity(doc, from, occupied);
    expect(swapped.activities[occupied].id).toBe(doc.activities[from].id);
    expect(swapped.activities[from].id).toBe(doc.activities[occupied].id);
    expect(swapped.links).toEqual(doc.links);
  });

  it('reorders steps and personas, keeping phase sizes and separators', () => {
    let doc = exampleBlueprint();
    doc = ops.addDivider(doc, doc.personas[1].id, 'Ligne');
    const ids = doc.steps.map((s) => s.id);
    const moved = ops.moveStep(doc, 4, 0);
    expect(moved.steps.map((s) => s.id)).toEqual([ids[4], ...ids.slice(0, 4)]);
    expect(spans(moved)).toEqual(spans(doc));
    const people = ops.movePersona(doc, 0, 2);
    expect(people.personas.map((p) => p.name)).toEqual(['Secrétaire', 'Praticien', 'Patient']);
    expect(people.dividers[0].after).toBe(doc.personas[1].id);
    expect(ops.moveStep(doc, 0, 9)).toBe(doc);
  });
});

describe('separators', () => {
  it('adds one per persona and drops it with its persona', () => {
    let doc = exampleBlueprint();
    const front = doc.personas[1].id;
    doc = ops.addDivider(doc, front, 'Ligne de visibilité');
    doc = ops.addDivider(doc, front, 'doublon');
    expect(doc.dividers).toHaveLength(1);
    doc = ops.setDividerLabel(doc, doc.dividers[0].id, 'Visibilité');
    expect(doc.dividers[0].label).toBe('Visibilité');
    expect(ops.removePersona(doc, front).dividers).toHaveLength(0);
    expect(roundTrip(doc).dividers).toEqual(doc.dividers);
  });
  it('can sit above the first persona and stays there when personas move', () => {
    let doc = ops.addDivider(exampleBlueprint(), ops.DIVIDER_TOP, 'Ligne de visibilité');
    doc = ops.movePersona(doc, 0, 2);
    doc = ops.removePersona(doc, doc.personas[0].id);
    expect(doc.dividers).toEqual([expect.objectContaining({ after: ops.DIVIDER_TOP, label: 'Ligne de visibilité' })]);
    expect(roundTrip(doc).dividers).toEqual(doc.dividers);
  });
});

describe('arrows and tags across the project', () => {
  it('updates arrow label and style', () => {
    const doc = exampleBlueprint();
    const id = doc.links[0].id;
    const next = ops.updateLink(doc, id, { label: 'valide', style: 'dashed', color: '#C2410C' });
    expect(next.links[0]).toMatchObject({ label: 'valide', style: 'dashed', color: '#C2410C' });
    expect(next.links[1]).toEqual(doc.links[1]);
  });

  it('counts, recolours and deletes tags everywhere', () => {
    let doc = exampleBlueprint();
    const keys = Object.keys(doc.activities);
    doc = ops.addTag(doc, keys[0], 'Irritant');
    doc = ops.addTag(doc, keys[1], 'irritant');
    doc = ops.addTag(doc, keys[1], 'mobile');
    expect(ops.tagCounts(doc)).toEqual([
      { tag: 'Irritant', count: 2 },
      { tag: 'mobile', count: 1 },
    ]);
    doc = ops.setTagColor(doc, 'IRRITANT', 3);
    expect(doc.tagColors.irritant).toBe(3);
    doc = ops.deleteTagEverywhere(doc, 'irritant');
    expect(ops.tagCounts(doc)).toEqual([{ tag: 'mobile', count: 1 }]);
    expect(doc.tagColors.irritant).toBeUndefined();
  });
});

describe('notes', () => {
  it('sets, clears and lists notes in board order', () => {
    let doc = exampleBlueprint();
    const [patient, secretary] = doc.personas;
    const late = ops.activityKey(patient.id, doc.steps[3].slots[0]);
    const early = ops.activityKey(secretary.id, doc.steps[1].slots[1]);
    doc = ops.setActivityNote(doc, late, 'Souvent en retard');
    doc = ops.setActivityNote(doc, early, ' À vérifier avec le cabinet ');
    expect(ops.collectNotes(doc).map((n) => [n.stepIndex, n.persona, n.note])).toEqual([
      [1, 'Secrétaire', 'À vérifier avec le cabinet'],
      [3, 'Patient', 'Souvent en retard'],
    ]);
    doc = ops.setActivityNote(doc, late, '   ');
    expect(doc.activities[late].note).toBeUndefined();
    expect(roundTrip(doc).activities[early].note).toBe(' À vérifier avec le cabinet ');
  });
});

describe('files', () => {
  it('round-trips through serialize/parse', () => {
    const doc = ops.setScene(exampleBlueprint(), 'x', { text: 'ignored' });
    const back = roundTrip(doc);
    expect(back.steps).toEqual(doc.steps);
    expect(back.activities).toEqual(doc.activities);
    expect(back.links).toEqual(doc.links);
  });

  it('rejects files that are not projects', () => {
    expect(() => parse('{"hello":1}')).toThrow(ProjectFileError);
    expect(() => parse('not json')).toThrow(ProjectFileError);
  });
});

describe('templates', () => {
  it('builds every template with consistent phases, in both languages', () => {
    for (const id of TEMPLATES) {
      for (const lang of ['fr', 'en'] as const) {
        const doc = createMap(id, lang);
        expect(spans(doc).reduce((a, b) => a + b, 0)).toBe(doc.steps.length);
        expect(doc.personas.length).toBeGreaterThan(0);
        for (const d of doc.dividers) expect(doc.personas.some((p) => p.id === d.after)).toBe(true);
      }
    }
    expect(createMap('mission-map', 'en').phases[0].title).toBe('Before');
    expect(createMap('mission-map', 'fr').phases[0].title).toBe('Avant');
  });
});

describe('alternatives', () => {
  it('adds a second card to a cell, once, and promotes it when the first goes', () => {
    let doc = exampleBlueprint();
    const key = ops.activityKey(doc.personas[0].id, doc.steps[0].slots[0]);
    const first = doc.activities[key].id;
    const r = ops.addAlternative(doc, key);
    expect(r.activityId).not.toBeNull();
    expect(ops.addAlternative(r.doc, key).activityId).toBeNull();
    expect(ops.addAlternative(r.doc, ops.altKey(key)).activityId).toBeNull();
    doc = ops.setActivityText(r.doc, ops.altKey(key), 'ou par téléphone');
    doc = ops.toggleLink(doc, first, r.activityId!);
    const removed = ops.removeActivity(doc, key);
    expect(removed.activities[key].text).toBe('ou par téléphone');
    expect(removed.activities[ops.altKey(key)]).toBeUndefined();
    expect(removed.links.some((l) => l.from === first)).toBe(false);
  });

  it('keeps cells valid when a card with an alternative is dragged away', () => {
    const base = exampleBlueprint();
    const key = ops.activityKey(base.personas[2].id, base.steps[0].slots[0]);
    const to = ops.activityKey(base.personas[2].id, base.steps[1].slots[0]);
    let doc = ops.createActivity(base, base.personas[2].id, base.steps[0].slots[0]).doc;
    doc = ops.addAlternative(doc, key).doc;
    const altId = doc.activities[ops.altKey(key)].id;
    doc = ops.moveActivity(doc, key, to);
    expect(doc.activities[key].id).toBe(altId);
    expect(doc.activities[ops.altKey(key)]).toBeUndefined();
  });
});

describe('alternative wording', () => {
  it('lets the word above an alternative be changed, and drops it if the card moves up', () => {
    let doc = exampleBlueprint();
    const key = ops.activityKey(doc.personas[0].id, doc.steps[0].slots[0]);
    doc = ops.addAlternative(doc, key).doc;
    expect(ops.setJoiner(doc, key, 'sinon')).toBe(doc);
    doc = ops.setJoiner(doc, ops.altKey(key), 'sinon');
    expect(doc.activities[ops.altKey(key)].joiner).toBe('sinon');
    expect(ops.removeActivity(doc, key).activities[key].joiner).toBeUndefined();
  });
});

describe('additional information row', () => {
  it('stores text per step and drops it with its step', () => {
    let doc = exampleBlueprint();
    doc = ops.setInfo(doc, doc.steps[0].id, 'Canal : mobile');
    expect(roundTrip(doc).infos[doc.steps[0].id]).toBe('Canal : mobile');
    expect(ops.removeStep(doc, 0).infos).toEqual({});
  });

  it('keeps a renamed title and description, and leaves the defaults unset', () => {
    const doc = exampleBlueprint();
    expect(roundTrip(doc).infoTitle).toBeUndefined();
    const renamed = roundTrip({ ...doc, infoTitle: 'Canaux', infoText: 'Par où passe le client' });
    expect([renamed.infoTitle, renamed.infoText]).toEqual(['Canaux', 'Par où passe le client']);
  });
});

describe('choice cards in a map', () => {
  it('creates a choice, finds it by id and turns it back into an activity', async () => {
    const { createFromTemplate } = await import('./templates');
    const doc0 = createFromTemplate('mission-map', 'fr').docs[0];
    if (doc0.kind !== 'mission-map') throw new Error('not a map');
    const map = doc0.map;
    const persona = map.personas[0];
    const slot = map.steps[1].slots[0];
    const { doc, activityId } = ops.createActivity(map, persona.id, slot, 'choice');
    const key = ops.activityKeyOf(doc, activityId)!;
    expect(key).toBe(ops.activityKey(persona.id, slot));
    expect(doc.activities[key].kind).toBe('choice');
    const back = ops.setActivityKind(doc, key, 'activity');
    expect('kind' in back.activities[key]).toBe(false);
    expect(ops.setActivityKind(back, key, 'activity')).toBe(back);
  });
});
