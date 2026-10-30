// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { create } from 'zustand';
import type { Blueprint, BoxKey, BoxStyle, Flow, Id, PersonaSheet, Project } from './model/types';
import { uid } from './model/ops';
import { parse } from './model/serialize';
import { findDoc, firstDocId, flowOf, missionMapOf, projectFromMap, sheetOf, updateFlow, updateMap, updateSheet } from './model/project';
import { initialLang, rememberLang, translate, type Lang, type MessageKey } from './i18n';

const HISTORY_LIMIT = 200;
/** Edits with the same coalesce key closer than this form one undo step. */
const COALESCE_MS = 1000;
const SESSION_KEY = 'missionmap:session';
/** Single-project autosave from version 0.1. */
const LEGACY_AUTOSAVE_KEY = 'missionmap:autosave';

export type Tool = 'select' | 'link';

/** Everything that belongs to one open project. */
interface DocState {
  project: Project;
  /** The project's document shown in this tab. */
  docId: Id;
  past: Project[];
  future: Project[];
  lastCoalesce: { key: string; at: number } | null;
  sel: BoxKey | null;
  zoom: number;
  filePath: string | null;
  dirty: boolean;
}

export interface Tab extends DocState {
  id: string;
}

/**
 * The active project's state lives at the top level, so components read
 * `project`, `sel`… directly (the mission map through useMap); `tabs` holds
 * every open project, and the active one's entry is brought up to date
 * whenever tabs are switched or saved.
 */
interface State extends DocState {
  tabs: Tab[];
  activeId: string | null;
  lang: Lang;
  /** Box to focus once it is mounted (after creating it). */
  pendingFocus: BoxKey | null;
  tool: Tool;
  linkFrom: Id | null;
  newProjectOpen: boolean;
  exportOpen: boolean;
  /** Lower-cased tags: cards without any of them are dimmed. */
  tagFilter: string[];
  /** Presentation mode: null when off, -1 for the overview, else a step index. */
  presentStep: number | null;
  /** Sheet shown in the side panel over the mission map. */
  sheetPreview: Id | null;
  /** New sheet dialog: closed, or open with a persona (of the map `mapDocId`) already picked, or none. */
  newSheet: { personaId: Id | null; mapDocId?: Id } | null;
  newFlowOpen: boolean;
  newMapOpen: boolean;
  /** Something slow under way (an image import, an export): shown as a spinner. */
  busy: string | null;

  /** Changes the mission map shown, as one undo step (or merged into the last with the same `coalesce`). */
  apply: (fn: (map: Blueprint) => Blueprint, opts?: { coalesce?: string }) => void;
  /** Changes the project as a whole: its title, its list of documents. */
  applyProject: (fn: (project: Project) => Project, opts?: { coalesce?: string }) => void;
  /** Changes the persona sheet shown. */
  applySheet: (fn: (sheet: PersonaSheet) => PersonaSheet, opts?: { coalesce?: string }) => void;
  /** Changes the flow shown. */
  applyFlow: (fn: (flow: Flow) => Flow, opts?: { coalesce?: string }) => void;
  /** Shows another document of the project. */
  setDoc: (docId: Id) => void;
  setSheetPreview: (docId: Id | null) => void;
  setNewSheet: (open: { personaId: Id | null; mapDocId?: Id } | null) => void;
  setNewFlowOpen: (open: boolean) => void;
  setNewMapOpen: (open: boolean) => void;
  setBusy: (busy: string | null) => void;
  /** Presentation: shows `step` (-1: the whole document) of another document. */
  presentAt: (docId: Id, step: number) => void;
  undo: () => void;
  redo: () => void;
  openTab: (project: Project, filePath: string | null, dirty?: boolean) => void;
  switchTab: (id: string) => void;
  closeTab: (id: string) => void;
  /** When the active project was last saved, for the Save button's feedback. */
  savedAt: number;
  markSaved: (filePath: string | null) => void;
  select: (key: BoxKey | null) => void;
  focusLater: (key: BoxKey) => void;
  setTool: (tool: Tool) => void;
  setLinkFrom: (id: Id | null) => void;
  setZoom: (zoom: number) => void;
  setLang: (lang: Lang) => void;
  setNewProjectOpen: (open: boolean) => void;
  setExportOpen: (open: boolean) => void;
  toggleTagFilter: (tag: string) => void;
  clearTagFilter: () => void;
  setPresentStep: (step: number | null) => void;
}

function fresh(project: Project, filePath: string | null, dirty = false): DocState {
  return { project, docId: firstDocId(project), past: [], future: [], lastCoalesce: null, sel: null, zoom: 1, filePath, dirty };
}

function pick(s: DocState): DocState {
  const { project, docId, past, future, lastCoalesce, sel, zoom, filePath, dirty } = s;
  return { project, docId, past, future, lastCoalesce, sel, zoom, filePath, dirty };
}

/** Placeholder while no project is open; never shown. */
const EMPTY_MAP: Blueprint = {
  objective: '', phases: [], steps: [], personas: [],
  activities: {}, scenes: {}, links: [], dividers: [], tagColors: {}, styles: {}, storyboard: false,
  textRows: [],
};
const emptyProject = projectFromMap('', EMPTY_MAP);

/** The mission map shown (an empty one when the document isn't a mission map). */
export function activeMap(s: DocState): Blueprint {
  return missionMapOf(s.project, s.docId)?.map ?? EMPTY_MAP;
}

/** The persona sheet shown, if the document is one. */
export function activeSheet(s: DocState): PersonaSheet | undefined {
  return sheetOf(s.project, s.docId)?.sheet;
}

/** The flow shown, if the document is one. */
export function activeFlow(s: DocState): Flow | undefined {
  return flowOf(s.project, s.docId)?.flow;
}

/** Box styles of the document shown. */
export function activeStyles(s: DocState): Record<string, BoxStyle> {
  return activeSheet(s)?.styles ?? activeFlow(s)?.styles ?? activeMap(s).styles;
}

/** Reads from the mission map shown; re-renders when the selected part changes. */
export function useMap<T>(selector: (map: Blueprint) => T): T {
  return useStore((s) => selector(activeMap(s)));
}

/** The document to show after the project changed under it (undo, redo). */
function keptDocId(project: Project, docId: Id): Id {
  return findDoc(project, docId) ? docId : firstDocId(project);
}

/** Tabs with the active one refreshed from the top-level state. */
export function syncedTabs(s: State): Tab[] {
  return s.tabs.map((t) => (t.id === s.activeId ? { ...pick(s), id: t.id } : t));
}

interface SavedSession {
  active: number;
  /** `doc` in sessions saved before 0.10. */
  tabs: { project?: unknown; doc?: unknown; filePath: string | null; dirty: boolean }[];
}

function restoreTabs(): { tabs: Tab[]; active: number } {
  try {
    const session = localStorage.getItem(SESSION_KEY);
    if (session) {
      const saved = JSON.parse(session) as SavedSession;
      const tabs: Tab[] = [];
      for (const t of saved.tabs) {
        try {
          tabs.push({ ...fresh(parse(JSON.stringify(t.project ?? t.doc)), t.filePath, t.dirty), id: uid() });
        } catch {
          // Skip a damaged entry, keep the others.
        }
      }
      return { tabs, active: Math.min(Math.max(0, saved.active), tabs.length - 1) };
    }
    const legacy = localStorage.getItem(LEGACY_AUTOSAVE_KEY);
    if (legacy) return { tabs: [{ ...fresh(parse(legacy), null, true), id: uid() }], active: 0 };
  } catch {
    // Unreadable session: start with no project open.
  }
  return { tabs: [], active: -1 };
}

const restored = restoreTabs();
const firstTab = restored.tabs[restored.active];

export const useStore = create<State>((set, get) => ({
  ...(firstTab ? pick(firstTab) : fresh(emptyProject, null)),
  tabs: restored.tabs,
  activeId: firstTab?.id ?? null,
  lang: initialLang(),
  pendingFocus: null,
  tool: 'select',
  linkFrom: null,
  newProjectOpen: false,
  exportOpen: false,
  tagFilter: [],
  presentStep: null,
  sheetPreview: null,
  newSheet: null,
  newFlowOpen: false,
  newMapOpen: false,
  busy: null,

  apply: (fn, opts) => {
    const { docId, applyProject } = get();
    applyProject((project) => updateMap(project, docId, fn), opts);
  },

  applySheet: (fn, opts) => {
    const { docId, applyProject } = get();
    applyProject((project) => updateSheet(project, docId, fn), opts);
  },

  applyFlow: (fn, opts) => {
    const { docId, applyProject } = get();
    applyProject((project) => updateFlow(project, docId, fn), opts);
  },

  setDoc: (docId) => {
    const s = get();
    if (docId === s.docId || !findDoc(s.project, docId)) return;
    set({ docId, sel: null, tool: 'select', linkFrom: null, pendingFocus: null, presentStep: null, sheetPreview: null, tagFilter: [] });
  },
  setSheetPreview: (sheetPreview) => set({ sheetPreview }),
  setNewSheet: (newSheet) => set({ newSheet }),
  setNewFlowOpen: (newFlowOpen) => set({ newFlowOpen }),
  setNewMapOpen: (newMapOpen) => set({ newMapOpen }),
  setBusy: (busy) => set({ busy }),
  presentAt: (docId, step) => {
    if (!findDoc(get().project, docId)) return;
    set({ docId, presentStep: step, sel: null, linkFrom: null, sheetPreview: null, tagFilter: [] });
  },

  applyProject: (fn, opts) => {
    const { project, past, lastCoalesce, activeId, docId } = get();
    if (!activeId) return;
    const next = fn(project);
    if (next === project) return;
    // The document shown may have just been removed.
    const shown = keptDocId(next, docId);
    if (shown !== docId) set({ docId: shown, sel: null, sheetPreview: null });
    const now = Date.now();
    const coalesce =
      opts?.coalesce !== undefined &&
      lastCoalesce?.key === opts.coalesce &&
      now - lastCoalesce.at < COALESCE_MS;
    set({
      project: next,
      past: coalesce ? past : past.concat([project]).slice(-HISTORY_LIMIT),
      future: [],
      lastCoalesce: opts?.coalesce !== undefined ? { key: opts.coalesce, at: now } : null,
      dirty: true,
    });
  },

  undo: () => {
    const { past, future, project, docId } = get();
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    set({
      project: previous,
      docId: keptDocId(previous, docId),
      past: past.slice(0, -1),
      future: [project].concat(future),
      lastCoalesce: null,
      linkFrom: null,
      dirty: true,
    });
  },

  redo: () => {
    const { past, future, project, docId } = get();
    if (future.length === 0) return;
    set({
      project: future[0],
      docId: keptDocId(future[0], docId),
      past: past.concat([project]),
      future: future.slice(1),
      lastCoalesce: null,
      linkFrom: null,
      dirty: true,
    });
  },

  openTab: (project, filePath, dirty = false) => {
    const tab: Tab = { ...fresh(project, filePath, dirty), id: uid() };
    set({ tabs: syncedTabs(get()).concat([tab]), activeId: tab.id, ...pick(tab), tool: 'select', linkFrom: null, sheetPreview: null });
  },

  switchTab: (id) => {
    const s = get();
    if (id === s.activeId) return;
    const tabs = syncedTabs(s);
    const target = tabs.find((t) => t.id === id);
    if (!target) return;
    set({ tabs, activeId: id, ...pick(target), tool: 'select', linkFrom: null, pendingFocus: null, sheetPreview: null });
  },

  closeTab: (id) => {
    const s = get();
    const tabs = syncedTabs(s);
    const index = tabs.findIndex((t) => t.id === id);
    if (index < 0) return;
    const rest = tabs.filter((t) => t.id !== id);
    if (id !== s.activeId) {
      set({ tabs: rest });
      return;
    }
    const next = rest[Math.min(index, rest.length - 1)];
    set({
      tabs: rest,
      activeId: next?.id ?? null,
      ...(next ? pick(next) : fresh(emptyProject, null)),
      tool: 'select',
      linkFrom: null,
      pendingFocus: null,
      sheetPreview: null,
    });
  },

  savedAt: 0,
  markSaved: (filePath) => set({ filePath, dirty: false, savedAt: Date.now() }),
  select: (key) => {
    if (get().sel !== key) set({ sel: key });
  },
  focusLater: (key) => set({ pendingFocus: key, sel: key }),
  setTool: (tool) => set({ tool, linkFrom: null }),
  setLinkFrom: (linkFrom) => set({ linkFrom }),
  setZoom: (zoom) => set({ zoom: Math.min(2, Math.max(0.3, Math.round(zoom * 100) / 100)) }),
  setLang: (lang) => {
    rememberLang(lang);
    document.documentElement.lang = lang;
    set({ lang });
  },
  setNewProjectOpen: (newProjectOpen) => set({ newProjectOpen }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
  toggleTagFilter: (tag) => {
    const key = tag.toLowerCase();
    const f = get().tagFilter;
    set({ tagFilter: f.includes(key) ? f.filter((x) => x !== key) : f.concat([key]) });
  },
  clearTagFilter: () => set({ tagFilter: [] }),
  setPresentStep: (presentStep) => set({ presentStep }),
}));

/** Translation for the current language, for use outside components. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(useStore.getState().lang, key, vars);
}

/** Translation hook: re-renders when the language changes. */
export function useT() {
  const lang = useStore((s) => s.lang);
  return (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
}

/** Writes the recovery copy of every open project now. */
export function saveSession() {
  const s = useStore.getState();
  const tabs = syncedTabs(s);
  const session: SavedSession = {
    active: tabs.findIndex((t) => t.id === s.activeId),
    tabs: tabs.map((t) => ({ project: t.project, filePath: t.filePath, dirty: t.dirty })),
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    localStorage.removeItem(LEGACY_AUTOSAVE_KEY);
  } catch {
    // Storage full or unavailable: the project files are the source of truth anyway.
  }
}

// Keep a recovery copy of every open project in local storage.
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((state, prev) => {
  if (state.project === prev.project && state.tabs === prev.tabs && state.activeId === prev.activeId && state.dirty === prev.dirty) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(saveSession, 500);
});
