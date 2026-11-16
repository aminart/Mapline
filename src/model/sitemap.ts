// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

// A sitemap: the screens of a product as a tree, by level of navigation,
// with the screens reached from everywhere kept apart. Every change returns
// a new sitemap, or the same one when nothing changed.

import type { Id, Screen, ScreenExtra, ScreenExtraKind, ScreenLink, ScreenStatus, Sitemap } from './types';
import { uid } from './ops';

export const SCREEN_STATUSES: ScreenStatus[] = ['existing', 'new', 'redo'];
export const EXTRA_KINDS: ScreenExtraKind[] = ['modal', 'error', 'success', 'info'];

/** A new screen: unnamed and to be made. */
export function newScreen(name = ''): Screen {
  return { id: uid(), name, status: 'new', children: [] };
}

/** A new sitemap: one empty screen to start from. */
export function emptySitemap(): Sitemap {
  return { roots: [newScreen()], globals: [] };
}

/** Where a screen sits: its parent (null at the top or among the global screens), its depth from 0. */
export interface ScreenPlace {
  screen: Screen;
  parent: Screen | null;
  global: boolean;
  depth: number;
}

/** Every screen of the tree, parents before their children, then the global screens. */
export function allScreens(sitemap: Sitemap): ScreenPlace[] {
  const out: ScreenPlace[] = [];
  const visit = (list: Screen[], parent: Screen | null, depth: number) => {
    for (const screen of list) {
      out.push({ screen, parent, global: false, depth });
      visit(screen.children, screen, depth + 1);
    }
  };
  visit(sitemap.roots, null, 0);
  for (const screen of sitemap.globals) out.push({ screen, parent: null, global: true, depth: 0 });
  return out;
}

export function findScreen(sitemap: Sitemap, id: Id): ScreenPlace | undefined {
  return allScreens(sitemap).find((p) => p.screen.id === id);
}

export function isGlobal(sitemap: Sitemap, id: Id): boolean {
  return sitemap.globals.some((s) => s.id === id);
}

/** Applies `fn` to every list of screens (the top level, each screen's children, the global screens). */
function mapLists(sitemap: Sitemap, fn: (list: Screen[], owner: Screen | null, global: boolean) => Screen[]): Sitemap {
  const visit = (list: Screen[], owner: Screen | null): Screen[] => {
    const next = fn(list, owner, false).map((s) => {
      const children = visit(s.children, s);
      return children === s.children ? s : { ...s, children };
    });
    return next.length === list.length && next.every((s, i) => s === list[i]) ? list : next;
  };
  const roots = visit(sitemap.roots, null);
  const globals = fn(sitemap.globals, null, true);
  return roots === sitemap.roots && globals === sitemap.globals ? sitemap : { roots, globals };
}

/** Applies `fn` to the screen `id`. */
export function updateScreen(sitemap: Sitemap, id: Id, fn: (screen: Screen) => Screen): Sitemap {
  return mapLists(sitemap, (list) => {
    const i = list.findIndex((s) => s.id === id);
    if (i < 0) return list;
    const next = fn(list[i]);
    if (next === list[i]) return list;
    const copy = list.slice();
    copy[i] = next;
    return copy;
  });
}

export function setScreen(sitemap: Sitemap, id: Id, patch: Partial<Pick<Screen, 'name' | 'status'>>): Sitemap {
  return updateScreen(sitemap, id, (s) => (Object.entries(patch).every(([k, v]) => s[k as keyof Screen] === v) ? s : { ...s, ...patch }));
}

/** Inserts `screen` into the list holding `id`, before or after it. */
function insertBeside(sitemap: Sitemap, id: Id, screen: Screen, where: 'before' | 'after'): Sitemap {
  return mapLists(sitemap, (list) => {
    const i = list.findIndex((s) => s.id === id);
    if (i < 0) return list;
    const copy = list.slice();
    copy.splice(where === 'after' ? i + 1 : i, 0, screen);
    return copy;
  });
}

/** Adds an empty screen after `id`, on its level (at the end of the top level when `id` is null). */
export function addScreenAfter(sitemap: Sitemap, id: Id | null): { sitemap: Sitemap; id: Id } {
  const screen = newScreen();
  if (id === null || !findScreen(sitemap, id)) return { sitemap: { ...sitemap, roots: sitemap.roots.concat([screen]) }, id: screen.id };
  return { sitemap: insertBeside(sitemap, id, screen, 'after'), id: screen.id };
}

/** Adds an empty screen under `id`, after its other children. A global screen has none. */
export function addChildScreen(sitemap: Sitemap, id: Id): { sitemap: Sitemap; id: Id | null } {
  if (isGlobal(sitemap, id) || !findScreen(sitemap, id)) return { sitemap, id: null };
  const screen = newScreen();
  return { sitemap: updateScreen(sitemap, id, (s) => ({ ...s, children: s.children.concat([screen]) })), id: screen.id };
}

/** Takes the screen `id` out, with the screens under it. */
export function removeScreen(sitemap: Sitemap, id: Id): Sitemap {
  return mapLists(sitemap, (list) => (list.some((s) => s.id === id) ? list.filter((s) => s.id !== id) : list));
}

/** Takes the screen out and puts its children where it was. */
function liftOut(sitemap: Sitemap, id: Id): { sitemap: Sitemap; screen: Screen } | null {
  const place = findScreen(sitemap, id);
  if (!place) return null;
  const { children, ...rest } = place.screen;
  const next = mapLists(sitemap, (list) => {
    const i = list.findIndex((s) => s.id === id);
    if (i < 0) return list;
    const copy = list.slice();
    copy.splice(i, 1, ...children);
    return copy;
  });
  return { sitemap: next, screen: { ...rest, children: [] } };
}

/** Whether `id` is `ancestor` or lies under it. */
export function isInside(sitemap: Sitemap, ancestor: Id, id: Id): boolean {
  const from = findScreen(sitemap, ancestor);
  if (!from) return false;
  const visit = (s: Screen): boolean => s.id === id || s.children.some(visit);
  return visit(from.screen);
}

/**
 * Moves the screen `id`, with the screens under it, beside or under `target`.
 * Next to a global screen it becomes global: its children then stay in the
 * tree, where it was.
 */
export function moveScreen(sitemap: Sitemap, id: Id, target: Id, where: 'before' | 'after' | 'inside'): Sitemap {
  if (id === target || isInside(sitemap, id, target)) return sitemap;
  const from = findScreen(sitemap, id);
  const to = findScreen(sitemap, target);
  if (!from || !to) return sitemap;
  if (where === 'inside' && to.global) return sitemap;
  let moving = from.screen;
  let next: Sitemap;
  if (to.global && !from.global) {
    const lifted = liftOut(sitemap, id)!;
    next = lifted.sitemap;
    moving = lifted.screen;
  } else {
    next = removeScreen(sitemap, id);
  }
  if (where === 'inside') return updateScreen(next, target, (s) => ({ ...s, children: s.children.concat([moving]) }));
  return insertBeside(next, target, moving, where);
}

/**
 * Makes a screen global (its children move up to where it was), or puts a
 * global screen back in the tree: under the first top level screen, or at
 * the top level when there is none.
 */
export function setGlobal(sitemap: Sitemap, id: Id, global: boolean): Sitemap {
  const place = findScreen(sitemap, id);
  if (!place || place.global === global) return sitemap;
  if (global) {
    const lifted = liftOut(sitemap, id)!;
    return { ...lifted.sitemap, globals: lifted.sitemap.globals.concat([lifted.screen]) };
  }
  const globals = sitemap.globals.filter((s) => s.id !== id);
  const first = sitemap.roots[0];
  if (!first) return { roots: [place.screen], globals };
  return updateScreen({ ...sitemap, globals }, first.id, (s) => ({ ...s, children: s.children.concat([place.screen]) }));
}

/** Moves a screen of the tree, with its children, to the end of the global screens; see setGlobal. */
export function moveToGlobals(sitemap: Sitemap, id: Id): Sitemap {
  return setGlobal(sitemap, id, true);
}

/**
 * The personas of a screen: its own, else those of the closest screen above
 * it that has some (`from` names it).
 */
export function screenPersonas(sitemap: Sitemap, id: Id): { ids: Id[]; from: Screen | null } {
  const path: Screen[] = [];
  const visit = (list: Screen[]): boolean => {
    for (const s of list) {
      path.push(s);
      if (s.id === id || visit(s.children)) return true;
      path.pop();
    }
    return false;
  };
  if (!visit(sitemap.roots)) {
    const g = sitemap.globals.find((s) => s.id === id);
    return { ids: g?.personaIds ?? [], from: null };
  }
  const own = path[path.length - 1];
  if (own.personaIds?.length) return { ids: own.personaIds, from: null };
  for (let i = path.length - 2; i >= 0; i--) if (path[i].personaIds?.length) return { ids: path[i].personaIds!, from: path[i] };
  return { ids: [], from: null };
}

/**
 * Adds a persona to a screen, or takes it off. A screen showing the personas
 * of the screen above it starts from those: it then has its own.
 */
export function toggleScreenPersona(sitemap: Sitemap, id: Id, personaId: Id): Sitemap {
  const current = screenPersonas(sitemap, id).ids;
  const next = current.includes(personaId) ? current.filter((p) => p !== personaId) : current.concat([personaId]);
  return updateScreen(sitemap, id, (s) => {
    const { personaIds: _old, ...rest } = s;
    return next.length ? { ...rest, personaIds: next } : rest;
  });
}

/** Drops a screen's own personas: it shows those of the screen above it again. */
export function inheritScreenPersonas(sitemap: Sitemap, id: Id): Sitemap {
  return updateScreen(sitemap, id, (s) => {
    if (!s.personaIds) return s;
    const { personaIds: _old, ...rest } = s;
    return rest;
  });
}

const sameLink = (a: ScreenLink, b: ScreenLink) => a.kind === b.kind && a.docId === b.docId && a.id === b.id;

export function addScreenLink(sitemap: Sitemap, id: Id, link: ScreenLink): Sitemap {
  return updateScreen(sitemap, id, (s) => (s.links?.some((l) => sameLink(l, link)) ? s : { ...s, links: (s.links ?? []).concat([link]) }));
}

export function removeScreenLink(sitemap: Sitemap, id: Id, link: ScreenLink): Sitemap {
  return updateScreen(sitemap, id, (s) => {
    if (!s.links?.some((l) => sameLink(l, link))) return s;
    const links = s.links.filter((l) => !sameLink(l, link));
    const { links: _old, ...rest } = s;
    return links.length ? { ...rest, links } : rest;
  });
}

/** Drops every link to the document `docId` (removed from the project). */
export function dropLinksTo(sitemap: Sitemap, docId: Id): Sitemap {
  return mapLists(sitemap, (list) => {
    if (!list.some((s) => s.links?.some((l) => l.docId === docId))) return list;
    return list.map((s) => {
      if (!s.links?.some((l) => l.docId === docId)) return s;
      const links = s.links.filter((l) => l.docId !== docId);
      const { links: _old, ...rest } = s;
      return links.length ? { ...rest, links } : rest;
    });
  });
}

/** Adds a modal or a message to a screen. */
export function addScreenExtra(sitemap: Sitemap, id: Id, kind: ScreenExtraKind, name: string): { sitemap: Sitemap; id: Id } {
  const extra: ScreenExtra = { id: uid(), kind, name };
  return { sitemap: updateScreen(sitemap, id, (s) => ({ ...s, extras: (s.extras ?? []).concat([extra]) })), id: extra.id };
}

export function setScreenExtra(sitemap: Sitemap, id: Id, extraId: Id, patch: Partial<Pick<ScreenExtra, 'kind' | 'name'>>): Sitemap {
  return updateScreen(sitemap, id, (s) => {
    const extras = s.extras ?? [];
    const i = extras.findIndex((x) => x.id === extraId);
    if (i < 0 || Object.entries(patch).every(([k, v]) => extras[i][k as keyof ScreenExtra] === v)) return s;
    const copy = extras.slice();
    copy[i] = { ...extras[i], ...patch };
    return { ...s, extras: copy };
  });
}

export function removeScreenExtra(sitemap: Sitemap, id: Id, extraId: Id): Sitemap {
  return updateScreen(sitemap, id, (s) => {
    if (!s.extras?.some((x) => x.id === extraId)) return s;
    const extras = s.extras.filter((x) => x.id !== extraId);
    const { extras: _old, ...rest } = s;
    return extras.length ? { ...rest, extras } : rest;
  });
}

export interface SitemapStats {
  /** Screens per level of the tree, from the top. */
  levels: number[];
  globals: number;
  /** Every screen: the tree's and the global ones. */
  total: number;
  status: Record<ScreenStatus, number>;
  /** Modals and messages, and those of screens to make or redo. */
  extras: number;
  extrasToDo: number;
}

/** What the sitemap holds, for the estimate: folded branches count too. */
export function sitemapStats(sitemap: Sitemap): SitemapStats {
  const stats: SitemapStats = { levels: [], globals: sitemap.globals.length, total: 0, status: { existing: 0, new: 0, redo: 0 }, extras: 0, extrasToDo: 0 };
  for (const { screen, global, depth } of allScreens(sitemap)) {
    if (!global) stats.levels[depth] = (stats.levels[depth] ?? 0) + 1;
    stats.total++;
    stats.status[screen.status]++;
    const n = screen.extras?.length ?? 0;
    stats.extras += n;
    if (screen.status !== 'existing') stats.extrasToDo += n;
  }
  return stats;
}

/** How many screens lie under `screen`, at every depth. */
export function countBelow(screen: Screen): number {
  return screen.children.reduce((n, c) => n + 1 + countBelow(c), 0);
}

/** The rows of the list view: each shown screen with its depth; folded screens hide theirs. */
export function listRows(sitemap: Sitemap, folded: (id: Id) => boolean): { screen: Screen; depth: number; global: boolean }[] {
  const rows: { screen: Screen; depth: number; global: boolean }[] = [];
  const visit = (list: Screen[], depth: number) => {
    for (const screen of list) {
      rows.push({ screen, depth, global: false });
      if (!folded(screen.id)) visit(screen.children, depth + 1);
    }
  };
  visit(sitemap.roots, 0);
  for (const screen of sitemap.globals) rows.push({ screen, depth: 0, global: true });
  return rows;
}
