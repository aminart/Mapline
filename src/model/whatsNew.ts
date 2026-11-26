// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Lang } from '../i18n';

/** A text in both languages of the app. */
type Text = Record<Lang, string>;

export interface WhatsNewItem {
  title: Text;
  text: Text;
}

export interface ReleaseNotes {
  /** The version these notes come with, as in package.json. */
  version: string;
  /** One line for the banner. */
  summary: Text;
  items: WhatsNewItem[];
}

/**
 * What each version brings, newest first, shown once after an update (see
 * lib/whatsNew.ts). Written with each version bump, in French and English;
 * a version without new features can be left out.
 */
export const RELEASE_NOTES: ReleaseNotes[] = [
  {
    version: '1.11.0',
    summary: {
      fr: 'Liens personas : un nouveau type de document pour montrer qui encadre, sollicite ou influence qui.',
      en: 'Persona links: a new document type to show who manages, asks or influences whom.',
    },
    items: [
      {
        title: { fr: 'Liens personas', en: 'Persona links' },
        text: {
          fr: 'Nouveau type de document (bouton « Ajouter »). Reliez vos personas par des liens. Vues Réseau et Cercles.',
          en: 'New document type (“Add” button). Connect your personas with typed links. Network and Circles views.',
        },
      },
      {
        title: { fr: 'Retrouver les nouveautés', en: 'Find what’s new again' },
        text: {
          fr: 'Après chaque mise à jour, ce bandeau présente ce qui a changé. Il reste accessible dans le menu « ? ».',
          en: 'After each update, this banner shows what changed. It stays available in the “?” menu.',
        },
      },
    ],
  },
  {
    version: '1.10.0',
    summary: {
      fr: 'Ajuster à l’écran, menu « Ajouter », fichiers récents sur l’accueil et une barre du haut plus compacte.',
      en: 'Fit to window, an “Add” menu, recent files on the start screen and a more compact top bar.',
    },
    items: [
      {
        title: { fr: 'Ajuster à l’écran', en: 'Fit to window' },
        text: {
          fr: 'Le bouton à côté du zoom (ou Ctrl+1) montre tout le document d’un coup.',
          en: 'The button next to the zoom (or Ctrl+1) shows the whole document at once.',
        },
      },
      {
        title: { fr: 'Menu « Ajouter » et fichiers récents', en: '“Add” menu and recent files' },
        text: {
          fr: 'Un seul menu pour ajouter une map, un flow, une fiche ou une arborescence. L’accueil liste les derniers fichiers ouverts.',
          en: 'One menu to add a map, a flow, a sheet or a sitemap. The start screen lists the files you opened last.',
        },
      },
      {
        title: { fr: 'Une interface plus calme', en: 'A calmer interface' },
        text: {
          fr: 'La barre du haut tient sur une ligne, les croix de suppression n’apparaissent qu’au survol et les noms de phase restent lisibles.',
          en: 'The top bar fits on one line, delete crosses only show on hover and phase names stay readable.',
        },
      },
    ],
  },
];

/** Compares two versions such as "1.10.0" and "1.9.2", number by number. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * The notes of the versions after `from` up to `to`, newest first. With no
 * `from` (the version before is not known), only those of `to`.
 */
export function notesBetween(from: string | null, to: string, notes: ReleaseNotes[] = RELEASE_NOTES): ReleaseNotes[] {
  return notes
    .filter((n) => compareVersions(n.version, to) <= 0 && (from === null ? compareVersions(n.version, to) === 0 : compareVersions(n.version, from) > 0))
    .sort((a, b) => compareVersions(b.version, a.version));
}

/** The notes of the newest version up to `current`, for the help menu. */
export function latestNotes(current: string, notes: ReleaseNotes[] = RELEASE_NOTES): ReleaseNotes | undefined {
  return notes.filter((n) => compareVersions(n.version, current) <= 0).sort((a, b) => compareVersions(b.version, a.version))[0];
}
