// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { activeSitemap, useStore, useT } from '../store';
import * as sm from '../model/sitemap';
import { CARD_W, layoutTree, type Branch, type CardBox } from '../model/sitemapLayout';
import type { BranchArea } from '../lib/exportPdf';
import { projectPersonas } from '../model/project';
import { personaAccent } from '../model/theme';
import type { Id, Project, Screen, ScreenExtraKind, ScreenLink, Sitemap } from '../model/types';
import { boardRef } from './Board';
import { startDrag, useDropTarget } from './dnd';
import { useFitText } from './useFitText';
import { useFocusKey } from './useFocusKey';
import { GripIcon, PlusIcon } from './Icons';
import { docLabel } from '../actions';
import { cls } from './cls';

/** Width of the column on the left naming each level and its count. */
export const RAIL_W = 104;

/** A link resolved against the project: what it points to, or null once that is gone. */
export function resolveScreenLink(project: Project, link: ScreenLink): { label: string; where: string } | null {
  const doc = project.docs.find((d) => d.id === link.docId);
  if (!doc) return null;
  if (link.kind === 'node' && doc.kind === 'flow') {
    const node = doc.flow.nodes.find((n) => n.id === link.id);
    return node ? { label: node.text.trim() || '…', where: docLabel(project, doc.id) } : null;
  }
  if (link.kind === 'step' && doc.kind === 'mission-map') {
    const i = doc.map.steps.findIndex((s) => s.id === link.id);
    return i >= 0 ? { label: `${i + 1} · ${doc.map.steps[i].title.trim() || '…'}`, where: docLabel(project, doc.id) } : null;
  }
  return null;
}

/** The links of a screen that still point to something. */
export function liveLinks(project: Project, screen: Screen): ScreenLink[] {
  return (screen.links ?? []).filter((l) => resolveScreenLink(project, l) !== null);
}

/** Whether a screen passes the filter of the toolbar. */
export function screenMatches(project: Project, sitemap: Sitemap, screen: Screen, filter: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'new' || filter === 'redo' || filter === 'existing') return screen.status === filter;
  const links = liveLinks(project, screen);
  if (filter === 'flow') return links.some((l) => l.kind === 'node');
  if (filter === 'map') return links.some((l) => l.kind === 'step');
  if (filter === 'none') return links.length === 0;
  if (filter === 'extras') return (screen.extras?.length ?? 0) > 0;
  if (filter.startsWith('persona:')) return sm.screenPersonas(sitemap, screen.id).ids.includes(filter.slice('persona:'.length));
  return true;
}

/** A sitemap: the counts for the estimate, the tree (or the list), the global screens. */
export function SitemapView() {
  const zoom = useStore((s) => s.zoom);
  const sitemap = useStore((s) => activeSitemap(s));
  const view = useStore((s) => s.sitemapView);
  useDeleteKey();
  if (!sitemap) return null;
  return (
    <div className="board-zoom" style={{ zoom } as CSSProperties}>
      <div className="sitemap-doc" ref={boardRef}>
        <SitemapSummary sitemap={sitemap} />
        {view === 'tree' ? (
          <>
            <SitemapTree sitemap={sitemap} />
            <GlobalScreens sitemap={sitemap} />
          </>
        ) : (
          <SitemapList sitemap={sitemap} />
        )}
      </div>
    </div>
  );
}

/** Delete or Backspace removes the selected screen, outside a text being typed. */
function useDeleteKey() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const s = useStore.getState();
      if (!s.sel?.startsWith('screen:') || s.presentStep !== null) return;
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      s.applySitemap((m) => sm.removeScreen(m, s.sel!.slice('screen:'.length)));
      s.select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** The counts: every view to plan, per level and status, the modals and messages. */
export function SitemapSummary({ sitemap }: { sitemap: Sitemap }) {
  const t = useT();
  const stats = sm.sitemapStats(sitemap);
  return (
    <div className="sitemap-summary">
      <span className="sitemap-total">
        <strong>{stats.total}</strong> {t('sitemap.total')}
      </span>
      <span className="sitemap-chips">
        {stats.levels.map((n, i) => (
          <span key={i} className="sitemap-chip">
            {t('sitemap.level', { n: i + 1 })} · <b>{n}</b>
          </span>
        ))}
        <span className="sitemap-chip">
          {t('sitemap.globals')} · <b>{stats.globals}</b>
        </span>
        <span className="sitemap-chip">
          {t('sitemap.extras')} · <b>{stats.extras}</b>
        </span>
      </span>
      <span className="sitemap-chips">
        {sm.SCREEN_STATUSES.map((st) => (
          <span key={st} className={cls('sitemap-chip', `is-${st}`)}>
            {t(`sitemap.status.${st}`)} · <b>{stats.status[st]}</b>
          </span>
        ))}
      </span>
      <span className="sitemap-todo">{t('sitemap.toDo', { views: stats.status.new + stats.status.redo, extras: stats.extrasToDo })}</span>
    </div>
  );
}

/** The tree: one row per level, the level's count on the left, connectors between the cards. */
function SitemapTree({ sitemap }: { sitemap: Sitemap }) {
  const t = useT();
  const folded = useStore((s) => s.folded);
  const applySitemap = useStore((s) => s.applySitemap);
  const focusLater = useStore((s) => s.focusLater);
  // Height each card's content needs, measured once drawn: a level is as tall as its tallest card.
  const [heights, setHeights] = useState<Record<Id, number>>({});
  const onMeasure = useCallback((id: Id, h: number) => setHeights((m) => (Math.abs((m[id] ?? 0) - h) < 1 ? m : { ...m, [id]: h })), []);
  const layout = layoutTree(sitemap.roots, (id) => !!folded[id], heights);
  const stats = sm.sitemapStats(sitemap);
  const byId = new Map(sm.allScreens(sitemap).map((p) => [p.screen.id, p.screen]));
  const add = () => {
    let id: Id | null = null;
    applySitemap((m) => {
      const r = sm.addScreenAfter(m, null);
      id = r.id;
      return r.sitemap;
    });
    if (id) focusLater(`screen:${id}`);
  };
  if (sitemap.roots.length === 0) {
    return (
      <div className="sitemap-empty no-export">
        <button className="add-dashed" onClick={add}>
          <PlusIcon size={12} /> {t('sitemap.addFirst')}
        </button>
      </div>
    );
  }
  // Where each branch is, for the PDF: right of the level column, named.
  const branchArea = (b: Branch): BranchArea => ({ name: byId.get(b.id)?.name ?? '', x0: b.x0 + RAIL_W, x1: b.x1 + RAIL_W, top: b.top, bottom: b.bottom, children: b.children.map(branchArea) });
  return (
    <div className="sitemap-tree" style={{ width: RAIL_W + layout.width + 24, height: layout.height + 24 }} data-branches={JSON.stringify(layout.branches.map(branchArea))}>
      <div className="sitemap-rail" style={{ height: layout.height + 24 }}>
        {layout.levels.map((lv, i) => {
          const n = stats.levels[i] ?? 0;
          return (
            <div key={i} className="sitemap-level" style={{ top: lv.top + lv.height / 2 }}>
              <span className="sitemap-level-name">{t('sitemap.level', { n: i + 1 })}</span>
              <span className="sitemap-level-count">{t(n > 1 ? 'sitemap.views' : 'sitemap.viewOne', { n })}</span>
            </div>
          );
        })}
      </div>
      {layout.segments.map((g, i) => (
        <div key={i} className={cls('sitemap-line', g.w === 0 ? 'is-v' : 'is-h')} style={{ left: RAIL_W + g.x, top: g.y, width: g.w, height: g.h }} />
      ))}
      {layout.cards.map((box) => {
        const screen = byId.get(box.id);
        return screen ? <ScreenCard key={box.id} sitemap={sitemap} screen={screen} box={box} onMeasure={onMeasure} /> : null;
      })}
    </div>
  );
}

/** The global screens: reached from every screen, without children. */
function GlobalScreens({ sitemap }: { sitemap: Sitemap }) {
  const t = useT();
  const applySitemap = useStore((s) => s.applySitemap);
  const drop = useDropTarget('screen', (d) => applySitemap((m) => sm.moveToGlobals(m, d.id)));
  return (
    <section className={cls('sitemap-globals', sitemap.globals.length === 0 && 'no-export')}>
      <div className="sitemap-globals-head">
        <h3>{t('sitemap.globals')}</h3>
        <span className="muted-sm">{t('sitemap.globalsHint')}</span>
      </div>
      <div className={cls('sitemap-globals-zone', drop.over && 'is-drop-target')} {...drop.props}>
        {sitemap.globals.map((screen) => (
          <ScreenCard key={screen.id} sitemap={sitemap} screen={screen} />
        ))}
        <span className="sitemap-globals-drop no-export">{t('sitemap.globalsDrop')}</span>
      </div>
    </section>
  );
}

type DropWhere = 'before' | 'after' | 'inside';

/** A screen: its name, written in place, its links and personas, its modals and messages. */
function ScreenCard(props: { sitemap: Sitemap; screen: Screen; box?: CardBox; onMeasure?: (id: Id, h: number) => void }) {
  const { sitemap, screen, box, onMeasure } = props;
  const t = useT();
  const key = `screen:${screen.id}`;
  const project = useStore((s) => s.project);
  const selected = useStore((s) => s.sel === key);
  const select = useStore((s) => s.select);
  const applySitemap = useStore((s) => s.applySitemap);
  const filter = useStore((s) => s.sitemapFilter);
  const folded = useStore((s) => !!s.folded[screen.id]);
  const setFolded = useStore((s) => s.setFolded);
  const ref = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const global = !box;
  const [where, setWhere] = useState<DropWhere | null>(null);
  const placeOf = (x: number): DropWhere => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return 'inside';
    const f = (x - r.left) / r.width;
    if (global) return f < 0.5 ? 'before' : 'after';
    return f < 0.25 ? 'before' : f > 0.75 ? 'after' : 'inside';
  };
  const drop = useDropTarget(
    'screen',
    (d, at) => {
      setWhere(null);
      applySitemap((m) => sm.moveScreen(m, d.id, screen.id, placeOf(at.x)));
    },
    (d, at) => setWhere(d.id === screen.id || sm.isInside(sitemap, d.id, screen.id) ? null : placeOf(at.x)),
  );
  useFocusKey(key, field);
  useFitText(field, [screen.name]);
  useLayoutEffect(() => {
    const el = content.current;
    if (!el || !onMeasure) return;
    const report = () => onMeasure(screen.id, el.offsetHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [screen.id, onMeasure]);

  const links = liveLinks(project, screen);
  const flows = links.filter((l) => l.kind === 'node').length;
  const maps = links.filter((l) => l.kind === 'step').length;
  const dimmed = !screenMatches(project, sitemap, screen, filter);
  const hidden = folded ? sm.countBelow(screen) : 0;
  const showWhere = drop.over && where;
  return (
    <div
      ref={ref}
      className={cls('box sitemap-card', `is-${screen.status}`, selected && 'is-selected', dimmed && 'is-dimmed', showWhere && `drop-${where}`, global && 'is-global')}
      style={box ? { left: RAIL_W + box.x, top: box.y, width: box.w, height: box.h } : { width: CARD_W }}
      data-screen={screen.id}
      {...drop.props}
      onClick={(e) => {
        if (e.target === e.currentTarget || e.target === content.current) field.current?.focus();
      }}
    >
      <div className="sitemap-card-content" ref={content}>
        <textarea
          ref={field}
          rows={1}
          className="sitemap-name"
          aria-label={t('sitemap.screenName')}
          placeholder={t('sitemap.screenPlaceholder')}
          value={screen.name}
          onFocus={() => select(key)}
          onChange={(e) => {
            const name = e.target.value.replace(/\n/g, ' ');
            applySitemap((m) => sm.setScreen(m, screen.id, { name }), { coalesce: `screen-name:${screen.id}` });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
        <div className="sitemap-meta">
          <span className={cls('sitemap-status', `is-${screen.status}`)}>{t(`sitemap.status.${screen.status}`)}</span>
          {flows > 0 && <span className="sitemap-count">Flow {flows}</span>}
          {maps > 0 && <span className="sitemap-count">Map {maps}</span>}
          <ScreenAvatars sitemap={sitemap} id={screen.id} />
        </div>
      </div>
      {(screen.extras?.length ?? 0) > 0 && <ExtraBadges screen={screen} />}
      {box && screen.children.length > 0 && (
        <button
          className="sitemap-fold no-export"
          aria-expanded={!folded}
          aria-label={folded ? t('sitemap.unfold', { n: hidden }) : t('sitemap.fold')}
          title={folded ? t('sitemap.unfold', { n: hidden }) : t('sitemap.fold')}
          onClick={() => setFolded(screen.id, !folded)}
        >
          {folded ? `+${hidden}` : '−'}
        </button>
      )}
      {folded && <span className="sitemap-folded-mark" aria-hidden="true" />}
      <span className="grip sitemap-grip card-btn no-export" title={t('sitemap.drag')} aria-hidden="true" onPointerDown={(e) => startDrag(e, { kind: 'screen', id: screen.id }, ref.current)}>
        <GripIcon size={12} />
      </span>
    </div>
  );
}

/** The personas of a screen: its own, or faded those it takes from the screen above. */
export function ScreenAvatars({ sitemap, id }: { sitemap: Sitemap; id: Id }) {
  const t = useT();
  const project = useStore((s) => s.project);
  const { ids, from } = sm.screenPersonas(sitemap, id);
  const all = projectPersonas(project);
  const shown = ids.flatMap((pid) => all.filter((p) => p.persona.id === pid));
  if (shown.length === 0) return null;
  return (
    <span className={cls('sitemap-avatars', from && 'is-inherited')} title={shown.map((p) => p.persona.name || t('doc.unnamed')).join(', ')}>
      {shown.slice(0, 3).map(({ persona, style, photo }) => (
        <span key={persona.id} className="sitemap-avatar" style={{ background: personaAccent(persona.color, style).accent }}>
          {photo ? <img src={photo} alt="" /> : (persona.name || '?').charAt(0).toUpperCase()}
        </span>
      ))}
      {shown.length > 3 && <span className="sitemap-avatar-more">+{shown.length - 3}</span>}
    </span>
  );
}

const EXTRA_GLYPH: Record<ScreenExtraKind, string> = { modal: '', error: '!', success: '✓', info: 'i' };

/** One modal or message kind, as a small coloured mark. */
export function ExtraMark({ kind, count }: { kind: ScreenExtraKind; count?: number }) {
  return (
    <span className={cls('sitemap-xmark', `is-${kind}`)}>
      {kind === 'modal' ? <span className="sitemap-xmodal" /> : EXTRA_GLYPH[kind]}
      {count !== undefined && count > 1 ? <span className="sitemap-xcount">{count}</span> : null}
    </span>
  );
}

/** The modals and messages of a screen, hanging under its card. */
function ExtraBadges({ screen }: { screen: Screen }) {
  const t = useT();
  const extras = screen.extras ?? [];
  const counts = new Map<ScreenExtraKind, number>();
  for (const x of extras) counts.set(x.kind, (counts.get(x.kind) ?? 0) + 1);
  return (
    <span className="sitemap-extras" title={extras.map((x) => `${t(`sitemap.extra.${x.kind}`)} : ${x.name}`).join('\n')}>
      {sm.EXTRA_KINDS.filter((k) => counts.has(k)).map((k) => (
        <ExtraMark key={k} kind={k} count={counts.get(k)} />
      ))}
    </span>
  );
}

/** The same screens as a list: indented by level, with their modals and messages. */
function SitemapList({ sitemap }: { sitemap: Sitemap }) {
  const t = useT();
  const project = useStore((s) => s.project);
  const folded = useStore((s) => s.folded);
  const setFolded = useStore((s) => s.setFolded);
  const sel = useStore((s) => s.sel);
  const select = useStore((s) => s.select);
  const filter = useStore((s) => s.sitemapFilter);
  const applySitemap = useStore((s) => s.applySitemap);
  const rows = sm.listRows(sitemap, (id) => !!folded[id]);
  return (
    <table className="sitemap-list">
      <thead>
        <tr>
          <th>{t('sitemap.col.screen')}</th>
          <th>{t('sitemap.col.level')}</th>
          <th>{t('sitemap.col.status')}</th>
          <th>{t('sitemap.col.personas')}</th>
          <th>{t('sitemap.col.links')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.flatMap(({ screen, depth, global }) => {
          const key = `screen:${screen.id}`;
          const dimmed = !screenMatches(project, sitemap, screen, filter);
          const isFolded = !!folded[screen.id];
          const indent = { paddingLeft: depth * 20 };
          const links = liveLinks(project, screen)
            .map((l) => resolveScreenLink(project, l))
            .filter((r) => r !== null)
            .map((r) => r.label);
          const main = (
            <tr key={screen.id} className={cls(sel === key && 'is-selected', dimmed && 'is-dimmed', global && 'is-global-row')} onClick={() => select(key)}>
              <td>
                <span className="sitemap-list-name" style={indent}>
                  {!global && screen.children.length > 0 ? (
                    <button
                      className="sitemap-twisty no-export"
                      aria-expanded={!isFolded}
                      aria-label={isFolded ? t('sitemap.unfold', { n: sm.countBelow(screen) }) : t('sitemap.fold')}
                      onClick={(e) => {
                        e.stopPropagation();
                        setFolded(screen.id, !isFolded);
                      }}
                    >
                      {isFolded ? '▸' : '▾'}
                    </button>
                  ) : (
                    <span className="sitemap-twisty-gap" />
                  )}
                  <ListName
                    screenKey={key}
                    value={screen.name}
                    onChange={(name) => applySitemap((m) => sm.setScreen(m, screen.id, { name }), { coalesce: `screen-name:${screen.id}` })}
                    onFocus={() => select(key)}
                  />
                </span>
              </td>
              <td className="sitemap-list-muted">{global ? t('sitemap.globalLevel') : t('sitemap.level', { n: depth + 1 })}</td>
              <td>
                <span className={cls('sitemap-status', `is-${screen.status}`)}>{t(`sitemap.status.${screen.status}`)}</span>
              </td>
              <td>
                <ScreenAvatars sitemap={sitemap} id={screen.id} />
              </td>
              <td className="sitemap-list-muted">{links.join(', ') || '–'}</td>
            </tr>
          );
          const extras = (screen.extras ?? []).map((x) => (
            <tr key={x.id} className={cls('sitemap-extra-row', dimmed && 'is-dimmed')} onClick={() => select(key)}>
              <td>
                <span className="sitemap-list-name" style={{ paddingLeft: depth * 20 + 24 }}>
                  <ExtraMark kind={x.kind} />
                  <span>{x.name || t(`sitemap.extra.${x.kind}`)}</span>
                </span>
              </td>
              <td className="sitemap-list-muted" colSpan={4}>
                {t('sitemap.extraOf', { kind: t(`sitemap.extra.${x.kind}`), screen: screen.name || t('sitemap.untitled') })}
              </td>
            </tr>
          ));
          return [main, ...extras];
        })}
      </tbody>
    </table>
  );
}

function ListName(props: { screenKey: string; value: string; onChange: (v: string) => void; onFocus: () => void }) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  useFocusKey(props.screenKey, ref);
  return (
    <input
      ref={ref}
      className="sitemap-list-input"
      aria-label={t('sitemap.screenName')}
      placeholder={t('sitemap.screenPlaceholder')}
      value={props.value}
      size={Math.max(12, props.value.length + 1)}
      onFocus={props.onFocus}
      onChange={(e) => props.onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
      }}
    />
  );
}
