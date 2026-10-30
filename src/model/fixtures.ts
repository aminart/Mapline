// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Blueprint, Project } from './types';
import { projectFromMap } from './project';
import { uid } from './ops';

/** A filled-in project, used by tests. */
export function exampleProject(): Project {
  return projectFromMap('Réservation en ligne', exampleBlueprint());
}

/** A filled-in mission map, used by tests. */
export function exampleBlueprint(): Blueprint {
  const [p1, p2, p3] = [uid(), uid(), uid()];
  const k = Array.from({ length: 6 }, () => uid());
  const a = Array.from({ length: 11 }, () => uid());
  const s = Array.from({ length: 5 }, () => uid());
  return {
    objective: 'Permettre à un patient de réserver une consultation en moins de 3 minutes',
    phases: [
      { id: uid(), title: 'Avant la visite', span: 3 },
      { id: uid(), title: 'Pendant', span: 1 },
      { id: uid(), title: 'Après', span: 1 },
    ],
    steps: [
      { id: s[0], title: 'Découverte', slots: [k[0]] },
      { id: s[1], title: 'Prise de rendez-vous', slots: [k[1], k[2]] },
      { id: s[2], title: 'Confirmation', slots: [k[3]] },
      { id: s[3], title: 'Consultation', slots: [k[4]] },
      { id: s[4], title: 'Suivi', slots: [k[5]] },
    ],
    personas: [
      { id: p1, name: 'Patient', role: 'Réserve depuis son téléphone, souvent pressé', color: 0 },
      { id: p2, name: 'Secrétaire', role: 'Gère l’agenda du cabinet', color: 1 },
      { id: p3, name: 'Praticien', role: 'Consulte et suit les dossiers', color: 2 },
    ],
    activities: {
      [`${p1}:${k[0]}`]: { id: a[0], text: 'Cherche un praticien disponible près de chez lui' },
      [`${p1}:${k[1]}`]: { id: a[1], text: 'Choisit un créneau' },
      [`${p1}:${k[2]}`]: { id: a[2], text: 'Renseigne ses informations' },
      [`${p1}:${k[3]}`]: { id: a[3], text: 'Reçoit un SMS de confirmation' },
      [`${p1}:${k[4]}`]: { id: a[4], text: 'Se présente au cabinet' },
      [`${p1}:${k[5]}`]: { id: a[5], text: 'Reçoit son compte-rendu' },
      [`${p2}:${k[2]}`]: { id: a[6], text: 'Valide la demande de rendez-vous' },
      [`${p2}:${k[3]}`]: { id: a[7], text: 'Envoie un rappel la veille' },
      [`${p2}:${k[4]}`]: { id: a[8], text: 'Accueille le patient' },
      [`${p3}:${k[4]}`]: { id: a[9], text: 'Consulte le motif et le dossier' },
      [`${p3}:${k[5]}`]: { id: a[10], text: 'Rédige le compte-rendu' },
    },
    scenes: {
      [s[0]]: { img: null, text: 'Recherche « médecin généraliste » sur son téléphone, dans le bus' },
      [s[1]]: { img: null, text: 'Compare les créneaux affichés sur la page du cabinet' },
    },
    links: [
      { id: uid(), from: a[1], to: a[2] },
      { id: uid(), from: a[2], to: a[6] },
      { id: uid(), from: a[6], to: a[3] },
      { id: uid(), from: a[10], to: a[5] },
    ],
    dividers: [],
    tagColors: {},
    styles: {},
    storyboard: true,
    textRows: [],
  };
}
