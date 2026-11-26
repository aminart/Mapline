// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { create } from 'zustand';
import { notesBetween, latestNotes, type ReleaseNotes } from '../model/whatsNew';

const KEY = 'mapline:whats-new';

/** How many times the app may open with the banner before it goes away by itself. */
export const MAX_OPENS = 3;

/** What is stored between launches. */
export interface WhatsNewState {
  /** The version before the update (null: not known), and the version installed. */
  from: string | null;
  to: string;
  /** Launches that showed the banner for this update. */
  opens: number;
  /** Closed, or shown MAX_OPENS times. */
  done: boolean;
}

/** Keys that earlier versions of Mapline leave behind: their presence means an update, not a first install. */
const EARLIER_KEYS = ['missionmap:lang', 'missionmap:theme', 'missionmap:session', 'missionmap:autosave', 'mapline:recent', 'mapline:export'];

/**
 * The state after a launch of version `current`, from the stored one.
 * A first install shows nothing; an update shows the notes since the
 * version before, and keeps those it did not finish showing.
 */
export function nextState(stored: WhatsNewState | null, current: string, usedBefore: boolean): WhatsNewState {
  let s: WhatsNewState;
  if (!stored) s = usedBefore ? { from: null, to: current, opens: 0, done: false } : { from: current, to: current, opens: 0, done: true };
  else if (stored.to !== current) s = { from: stored.done ? stored.to : stored.from, to: current, opens: 0, done: false };
  else s = { ...stored };
  if (s.done) return s;
  if (!notesBetween(s.from, s.to).length || s.opens >= MAX_OPENS) return { ...s, done: true };
  return { ...s, opens: s.opens + 1 };
}

function read(): WhatsNewState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<WhatsNewState>;
    if (typeof v.to !== 'string') return null;
    return { from: typeof v.from === 'string' ? v.from : null, to: v.to, opens: Number(v.opens) || 0, done: !!v.done };
  } catch {
    return null;
  }
}

function write(s: WhatsNewState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Not critical: the banner may come back next time.
  }
}

function usedBefore(): boolean {
  try {
    return EARLIER_KEYS.some((k) => localStorage.getItem(k) !== null);
  } catch {
    return false;
  }
}

interface WhatsNewStore {
  /** The notes to show, newest first; empty when there is nothing to show. */
  notes: ReleaseNotes[];
  /** The banner under the top bar. */
  banner: boolean;
  /** The list, under the banner or opened from the help menu. */
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Closes the banner and the list for good, for this version. */
  dismiss: () => void;
  /** Opens the list of the latest version, from the help menu. */
  showLatest: () => void;
}

/** Runs once per launch, when the app starts. */
function launch(): Pick<WhatsNewStore, 'notes' | 'banner'> {
  const s = nextState(read(), __APP_VERSION__, usedBefore());
  write(s);
  return s.done ? { notes: [], banner: false } : { notes: notesBetween(s.from, s.to), banner: true };
}

export const useWhatsNew = create<WhatsNewStore>((set, get) => ({
  ...launch(),
  open: false,
  setOpen: (open) => set({ open }),
  dismiss: () => {
    const s = read();
    if (s) write({ ...s, done: true });
    set({ banner: false, open: false });
  },
  showLatest: () => {
    if (get().banner) return set({ open: true });
    const latest = latestNotes(__APP_VERSION__);
    if (latest) set({ notes: [latest], open: true });
  },
}));

/** Whether the help menu has notes to offer for this version. */
export const hasNotes = () => latestNotes(__APP_VERSION__) !== undefined;
