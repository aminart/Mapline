// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import * as sm from './sitemap';
import { CARD_W, GAP_X, LEVEL_GAP, MIN_CARD_H, layoutTree } from './sitemapLayout';
import { parse, serialize } from './serialize';
import { createSitemapProject } from './templates';
import { removeDoc } from './project';
import type { Screen, Sitemap } from './types';
import { planSitemapPages, type SitemapPdfLayout } from '../lib/exportPdf';

const screen = (id: string, children: Screen[] = [], extra: Partial<Screen> = {}): Screen => ({ id, name: id, status: 'new', children, ...extra });

/** Home > (Shop > (List, Item), Account > Orders), and a global Login. */
function sample(): Sitemap {
  return {
    roots: [screen('home', [screen('shop', [screen('list'), screen('item')]), screen('account', [screen('orders')])])],
    globals: [screen('login')],
  };
}

const names = (list: Screen[]): unknown[] => list.map((s) => (s.children.length ? [s.id, names(s.children)] : s.id));

describe('sitemap', () => {
  it('counts screens by level, the global ones apart, and what is to make', () => {
    let m = sample();
    m = sm.setScreen(m, 'home', { status: 'existing' });
    m = sm.addScreenExtra(m, 'item', 'error', 'Out of stock').sitemap;
    m = sm.addScreenExtra(m, 'home', 'modal', 'Cookies').sitemap;
    const stats = sm.sitemapStats(m);
    expect(stats.levels).toEqual([1, 2, 3]);
    expect(stats.globals).toBe(1);
    expect(stats.total).toBe(7);
    expect(stats.status).toEqual({ existing: 1, new: 6, redo: 0 });
    // The modal of an existing screen is not to make.
    expect(stats.extras).toBe(2);
    expect(stats.extrasToDo).toBe(1);
  });

  it('adds a screen beside another, or under it', () => {
    const after = sm.addScreenAfter(sample(), 'shop');
    expect(after.sitemap.roots[0].children.map((s) => s.id)).toEqual(['shop', after.id, 'account']);
    const child = sm.addChildScreen(sample(), 'orders');
    expect(sm.findScreen(child.sitemap, child.id!)).toMatchObject({ depth: 3 });
    // A global screen has no children.
    expect(sm.addChildScreen(sample(), 'login').id).toBeNull();
  });

  it('removes a screen with the screens under it', () => {
    const m = sm.removeScreen(sample(), 'shop');
    expect(names(m.roots)).toEqual([['home', [['account', ['orders']]]]]);
  });

  it('moves a screen before, after or inside another, never into its own branch', () => {
    expect(names(sm.moveScreen(sample(), 'orders', 'list', 'before').roots)).toEqual([['home', [['shop', ['orders', 'list', 'item']], 'account']]]);
    expect(names(sm.moveScreen(sample(), 'account', 'item', 'inside').roots)).toEqual([['home', [['shop', ['list', ['item', [['account', ['orders']]]]]]]]]);
    expect(sm.moveScreen(sample(), 'shop', 'list', 'inside')).toEqual(sample());
  });

  it('makes a screen global, its children taking its place, and back', () => {
    let m = sm.setGlobal(sample(), 'shop', true);
    expect(m.globals.map((s) => s.id)).toEqual(['login', 'shop']);
    expect(names(m.roots)).toEqual([['home', ['list', 'item', ['account', ['orders']]]]]);
    m = sm.setGlobal(m, 'login', false);
    expect(m.globals.map((s) => s.id)).toEqual(['shop']);
    expect(sm.findScreen(m, 'login')).toMatchObject({ depth: 1, global: false });
    // Dropped next to a global screen, a screen becomes global too.
    m = sm.moveScreen(sample(), 'orders', 'login', 'after');
    expect(m.globals.map((s) => s.id)).toEqual(['login', 'orders']);
  });

  it('gives a screen the personas of the closest screen above that has some', () => {
    let m = sm.toggleScreenPersona(sample(), 'shop', 'p1');
    expect(sm.screenPersonas(m, 'item')).toMatchObject({ ids: ['p1'], from: { id: 'shop' } });
    expect(sm.screenPersonas(m, 'shop')).toMatchObject({ ids: ['p1'], from: null });
    expect(sm.screenPersonas(m, 'orders').ids).toEqual([]);
    // Changing an inherited list makes it the screen's own.
    m = sm.toggleScreenPersona(m, 'item', 'p2');
    expect(sm.screenPersonas(m, 'item')).toMatchObject({ ids: ['p1', 'p2'], from: null });
    m = sm.inheritScreenPersonas(m, 'item');
    expect(sm.screenPersonas(m, 'item').from?.id).toBe('shop');
  });

  it('links screens to flow cards and map steps, and forgets the links of a removed document', () => {
    let m = sm.addScreenLink(sample(), 'item', { kind: 'node', docId: 'flow1', id: 'n1' });
    m = sm.addScreenLink(m, 'item', { kind: 'node', docId: 'flow1', id: 'n1' });
    m = sm.addScreenLink(m, 'list', { kind: 'step', docId: 'map1', id: 's1' });
    expect(sm.findScreen(m, 'item')?.screen.links).toHaveLength(1);
    m = sm.dropLinksTo(m, 'flow1');
    expect(sm.findScreen(m, 'item')?.screen.links).toBeUndefined();
    expect(sm.findScreen(m, 'list')?.screen.links).toHaveLength(1);
  });

  it('lists the screens shown, folded branches closed', () => {
    const rows = sm.listRows(sample(), (id) => id === 'shop');
    expect(rows.map((r) => [r.screen.id, r.depth, r.global])).toEqual([
      ['home', 0, false],
      ['shop', 1, false],
      ['account', 1, false],
      ['orders', 2, false],
      ['login', 0, true],
    ]);
  });
});

describe('sitemap files', () => {
  it('round-trips a sitemap project', () => {
    const project = createSitemapProject('fr');
    const doc = project.docs[0];
    if (doc.kind !== 'sitemap') throw new Error('not a sitemap');
    let m = sample();
    m = sm.addScreenExtra(m, 'item', 'success', 'Ajouté').sitemap;
    m = sm.toggleScreenPersona(m, 'shop', 'p1');
    m = sm.addScreenLink(m, 'list', { kind: 'step', docId: 'map1', id: 's1' });
    const full = { ...project, docs: [{ ...doc, sitemap: m }] };
    expect(parse(serialize(full))).toEqual(full);
  });

  it('reads a damaged sitemap safely', () => {
    const project = createSitemapProject('en');
    const raw = JSON.parse(serialize(project));
    raw.docs[0].sitemap = {
      roots: [{ id: 'a', name: 'A', status: 'odd', children: [{ id: 'a', name: 'Same id' }], extras: [{ kind: 'nope', name: 'X' }] }],
      globals: [{ id: 'g', name: 'G', children: [{ id: 'c', name: 'Child' }] }],
    };
    const doc = parse(JSON.stringify(raw)).docs[0];
    if (doc.kind !== 'sitemap') throw new Error('not a sitemap');
    const [a] = doc.sitemap.roots;
    expect(a.status).toBe('new');
    expect(a.children[0].id).not.toBe('a');
    expect(a.extras?.[0].kind).toBe('modal');
    expect(doc.sitemap.globals[0].children).toEqual([]);
  });

  it('drops the links to a document removed from the project', () => {
    const project = createSitemapProject('fr');
    const doc = project.docs[0];
    if (doc.kind !== 'sitemap') throw new Error('not a sitemap');
    const linked = sm.addScreenLink(doc.sitemap, doc.sitemap.roots[0].id, { kind: 'node', docId: 'gone', id: 'n' });
    const withFlow = { ...project, docs: [{ ...doc, sitemap: linked }, { id: 'gone', kind: 'flow' as const, name: '', flow: { nodes: [], edges: [] } }] };
    const after = removeDoc(withFlow as never, 'gone').docs[0];
    if (after.kind !== 'sitemap') throw new Error('not a sitemap');
    expect(after.sitemap.roots[0].links).toBeUndefined();
  });
});

describe('layoutTree', () => {
  it('centres each screen over its children, a row per level', () => {
    const m = sample();
    const layout = layoutTree(m.roots, () => false, { item: 120 });
    const at = (id: string) => layout.cards.find((c) => c.id === id)!;
    expect(layout.levels.map((l) => l.height)).toEqual([MIN_CARD_H, MIN_CARD_H, 120]);
    expect(at('list').y).toBe(2 * (MIN_CARD_H + LEVEL_GAP));
    expect(at('item').x - at('list').x).toBe(CARD_W + GAP_X);
    expect(at('shop').x + CARD_W / 2).toBe((at('list').x + at('item').x + CARD_W) / 2);
    expect(at('home').x + CARD_W / 2).toBe((at('shop').x + at('account').x + CARD_W) / 2);
    // Every card of a level as tall as the row.
    expect(at('list').h).toBe(120);
    expect(layout.width).toBe(3 * CARD_W + 2 * GAP_X);
  });

  it('leaves out the screens under a folded one', () => {
    const layout = layoutTree(sample().roots, (id) => id === 'shop', {});
    expect(layout.cards.map((c) => c.id).sort()).toEqual(['account', 'home', 'orders', 'shop']);
    expect(layout.levels).toHaveLength(3);
  });

  it('gives a branch per screen of the second level, starting just above its card', () => {
    const layout = layoutTree(sample().roots, () => false, {});
    expect(layout.branches.map((b) => b.id)).toEqual(['shop', 'account']);
    const shop = layout.branches[0];
    expect(shop.x1 - shop.x0).toBe(2 * CARD_W + GAP_X);
    expect(shop.top).toBeGreaterThan(MIN_CARD_H + LEVEL_GAP / 2);
    expect(shop.top).toBeLessThan(MIN_CARD_H + LEVEL_GAP);
  });

  it('gives a branch per top screen when there are several', () => {
    const layout = layoutTree([screen('a', [screen('a1')]), screen('b')], () => false, {});
    expect(layout.branches.map((b) => [b.id, b.top])).toEqual([
      ['a', 0],
      ['b', 0],
    ]);
  });
});

describe('planSitemapPages', () => {
  const A4 = { w: 842, h: 595 };
  const labels = { branch: (n: string) => `Branch ${n}`, globals: 'Globals' };
  const layout = (branches: SitemapPdfLayout['branches'], globals: SitemapPdfLayout['globals'] = null): SitemapPdfLayout => ({
    width: 3000,
    height: 900,
    treeTop: 100,
    treeBottom: 700,
    railRight: 104,
    branches,
    globals,
    summary: '',
  });

  it('puts each branch on its page, the level column on its left, then the global screens', () => {
    const pages = planSitemapPages(layout([{ x0: 200, x1: 600, top: 230, name: 'Shop' }, { x0: 620, x1: 2900, top: 230, name: 'Account' }], { top: 720, bottom: 880 }), A4, labels);
    expect(pages.map((p) => p.label)).toEqual(['Branch Shop', 'Branch Account', 'Globals']);
    expect(pages[0].parts[0]).toEqual({ x0: 0, x1: 104 });
    // Screens above the branch are left out.
    expect(pages[0].top).toBe(230);
    expect(pages[0].bottom).toBe(700);
    // Never shown bigger than 133 %, a wide branch scaled down to fit whole.
    expect(pages[0].k).toBeLessThanOrEqual(1.33);
    const wide = pages[1];
    const w = wide.parts.reduce((s, p) => s + p.x1 - p.x0, 0);
    expect(w * wide.k).toBeLessThanOrEqual(A4.w);
    expect(pages[2]).toMatchObject({ top: 720, bottom: 880 });
  });

  it('keeps a branch within the picture', () => {
    const [page] = planSitemapPages(layout([{ x0: 2950, x1: 3000, top: 0, name: 'Edge' }]), A4, labels);
    expect(page.parts[1].x1).toBeLessThanOrEqual(3000);
    expect(page.top).toBe(100);
  });
});
