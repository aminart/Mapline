// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The recovery copy of the open projects, kept in IndexedDB: one entry per
 * project, rewritten only when that project changed, and an index of the
 * tabs. IndexedDB holds far more than local storage (about 5 MB, which a few
 * photos fill), and stores the projects as they are, without turning them
 * into text on every change.
 */

const DB_NAME = 'mapline';
const STORE = 'session';
const INDEX_KEY = 'index';

export interface SessionTab {
  /** The entry holding the tab's project. */
  key: string;
  filePath: string | null;
  dirty: boolean;
}

export interface SessionIndex {
  active: number;
  tabs: SessionTab[];
}

let opening: Promise<IDBDatabase | null> | undefined;

/** The database, or null where IndexedDB is unavailable (private windows, some tests). */
function db(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

function done(tx: IDBTransaction): Promise<boolean> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
}

/** The saved index and every project it lists, or null when there is none (or no IndexedDB). */
export async function readSession(): Promise<{ index: SessionIndex; projects: Map<string, unknown> } | null> {
  const d = await db();
  if (!d) return null;
  try {
    const tx = d.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const get = <T,>(key: string) =>
      new Promise<T | undefined>((resolve) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => resolve(undefined);
      });
    const index = await get<SessionIndex>(INDEX_KEY);
    if (!index || !Array.isArray(index.tabs)) return null;
    const projects = new Map<string, unknown>();
    for (const tab of index.tabs) projects.set(tab.key, await get(tab.key));
    return { index, projects };
  } catch {
    return null;
  }
}

/**
 * Writes the index, the projects in `changed` (by key), and removes the
 * entries no tab uses any more. Resolves to false when nothing could be written.
 */
export async function writeSession(index: SessionIndex, changed: Map<string, unknown>): Promise<boolean> {
  const d = await db();
  if (!d) return false;
  try {
    const tx = d.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const [key, project] of changed) store.put(project, key);
    store.put(index, INDEX_KEY);
    const keep = new Set([INDEX_KEY, ...index.tabs.map((t) => t.key)]);
    const keys = store.getAllKeys();
    keys.onsuccess = () => {
      for (const key of keys.result) if (!keep.has(String(key))) store.delete(key);
    };
    return await done(tx);
  } catch {
    return false;
  }
}
