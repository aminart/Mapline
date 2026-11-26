// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { activePersonaLinks, useStore, useT } from '../store';
import { isSingular } from '../i18n';
import * as pl from '../model/personaLinks';
import { personaAccent } from '../model/theme';
import { personaFlows } from '../model/links';
import type { Id, PersonaLinks, PersonaZone, Relation, RelationDash, RelationType } from '../model/types';
import { shown } from '../lib/shownColor';
import { docLabel } from '../actions';
import { boardRef } from './Board';
import { GripIcon } from './Icons';
import { cls } from './cls';

/** The kind of relation new links get: the one picked in the toolbar, else "Works with", else the first. */
export function currentType(links: PersonaLinks, picked: Id | null): RelationType | undefined {
  return links.types.find((t) => t.id === picked) ?? links.types.find((t) => t.id === 'works') ?? links.types[0];
}

/** A short line drawn as a kind of relation draws it, for the legend and the menus. */
export function LineSample({ type, width = 30 }: { type: Pick<RelationType, 'color' | 'dash' | 'dir'>; width?: number }) {
  const color = shown(type.color, 'line');
  const head = type.dir !== 'none';
  const dash = pl.dashArray(type.dash, 2);
  return (
    <svg className="plinks-sample" width={width} height={10} viewBox={`0 0 ${width} 10`} aria-hidden="true">
      <path d={`M${type.dir === 'both' ? 8 : 2} 5H${head ? width - 8 : width - 2}`} stroke={type.color} style={{ stroke: color }} strokeWidth={2} strokeLinecap="round" strokeDasharray={dash.length ? dash.join(' ') : undefined} fill="none" />
      {head && <path d={`M${width - 8} 1.5L${width - 1} 5L${width - 8} 8.5z`} fill={type.color} style={{ fill: color }} />}
      {type.dir === 'both' && <path d="M8 1.5L1 5L8 8.5z" fill={type.color} style={{ fill: color }} />}
    </svg>
  );
}

export const DASH_LABEL: Record<RelationDash, 'plinks.dash.solid' | 'plinks.dash.dashed' | 'plinks.dash.dotted' | 'plinks.dash.dashdot'> = {
  solid: 'plinks.dash.solid',
  dashed: 'plinks.dash.dashed',
  dotted: 'plinks.dash.dotted',
  dashdot: 'plinks.dash.dashdot',
};

/** Two letters for a persona without a photo. */
export function initials(name: string): string {
  const words = name.replace(/^(Dr|Pr|Me)\.?\s+/i, '').trim().split(/\s+/).filter(Boolean);
  return (words.length ? words.slice(0, 2).map((w) => w.charAt(0)) : ['?']).join('').toUpperCase();
}

const MIN_W = 880;
const MIN_H = 520;

/** A persona links page: the counts and legend, then the personas and their relations. */
export function PersonaLinksView() {
  const t = useT();
  const zoom = useStore((s) => s.zoom);
  const links = useStore((s) => activePersonaLinks(s));
  const project = useStore((s) => s.project);
  const view = useStore((s) => s.plinksView);
  const centerPick = useStore((s) => s.plinksCenter);
  const hidden = useStore((s) => s.plinksHidden);
  const showZones = useStore((s) => s.plinksZones);
  const suggest = useStore((s) => s.plinksSuggest);
  const sel = useStore((s) => s.sel);
  const select = useStore((s) => s.select);
  const tool = useStore((s) => s.tool);
  const linkFrom = useStore((s) => s.linkFrom);
  const setLinkFrom = useStore((s) => s.setLinkFrom);
  const setTool = useStore((s) => s.setTool);
  const setPlinks = useStore((s) => s.setPlinks);
  const pickedType = useStore((s) => s.plinksType);
  const applyPersonaLinks = useStore((s) => s.applyPersonaLinks);
  // A card or zone being dragged: where it is now, before the move is kept.
  const [drag, setDrag] = useState<{ ids: Id[]; dx: number; dy: number; zone?: { id: Id; dw: number; dh: number; resize: boolean } } | null>(null);
  const page = useRef<HTMLDivElement>(null);
  if (!links) return null;

  const live = pl.liveNodes(project, links);
  const byId = new Map(live.map((l) => [l.node.id, l]));
  const shownRelations = links.relations.filter((r) => !hidden.includes(r.type) && byId.has(r.from) && byId.has(r.to));
  const typeOf = new Map(links.types.map((ty) => [ty.id, ty]));
  const circles = view === 'circles' && live.length > 0;
  const chosen = sel?.startsWith('pnode:') ? sel.slice(6) : null;
  // The persona picked for the circles, else the one chosen, else the one with most relations.
  const center = circles ? (centerPick && byId.has(centerPick) ? centerPick : chosen && byId.has(chosen) ? chosen : pl.busiestNode({ ...links, nodes: live.map((l) => l.node) }, shownRelations)) : null;
  const ring = circles && center ? pl.circlesLayout({ ...links, nodes: live.map((l) => l.node) }, center, shownRelations) : null;

  const posOf = (id: Id): { x: number; y: number } => {
    if (ring) return ring.positions[id] ?? { x: 0, y: 0 };
    const n = byId.get(id)!.node;
    if (drag?.ids.includes(id)) return { x: Math.max(0, n.x + drag.dx), y: Math.max(0, n.y + drag.dy) };
    return { x: n.x, y: n.y };
  };
  const zoneRect = (z: PersonaZone) => {
    if (!drag?.zone || drag.zone.id !== z.id) return z;
    return drag.zone.resize ? { ...z, w: Math.max(160, z.w + drag.zone.dw), h: Math.max(80, z.h + drag.zone.dh) } : { ...z, x: Math.max(0, z.x + drag.dx), y: Math.max(0, z.y + drag.dy) };
  };
  const size = ring ? { width: ring.width, height: ring.height } : pl.pageSize({ ...links, nodes: live.map((l) => ({ ...l.node, ...posOf(l.node.id) })), zones: showZones ? links.zones.map(zoneRect) : [] });
  const width = Math.max(MIN_W, size.width);
  const height = Math.max(MIN_H, size.height);

  const selNode = sel?.startsWith('pnode:') ? sel.slice(6) : null;
  const selRel = sel?.startsWith('prel:') ? links.relations.find((r) => r.id === sel.slice(5)) : undefined;
  // A persona chosen: its relations come forward, the others fade.
  const focus = selNode ? new Set([selNode, ...shownRelations.filter((r) => r.from === selNode || r.to === selNode).flatMap((r) => [r.from, r.to])]) : selRel ? new Set([selRel.from, selRel.to]) : null;
  const faded = (r: Relation) => (selNode ? r.from !== selNode && r.to !== selNode : selRel ? r.id !== selRel.id : false);
  const offsets = pl.relationOffsets(shownRelations);
  const type = currentType(links, pickedType);

  /** Follows the pointer from a press on a card or zone, then keeps the move, or takes it as a click. */
  const follow = (e: React.PointerEvent, ids: Id[], onClick: () => void, zone?: { id: Id; resize: boolean }) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY };
    const scale = (page.current?.getBoundingClientRect().width ?? width) / width || 1;
    let moved = false;
    let delta = { dx: 0, dy: 0 };
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / scale;
      const dy = (ev.clientY - start.y) / scale;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      delta = { dx, dy };
      setDrag({ ids, dx, dy, ...(zone ? { zone: { id: zone.id, dw: dx, dh: dy, resize: zone.resize } } : {}) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      if (!moved) return onClick();
      if (zone) {
        const z = links.zones.find((x) => x.id === zone.id);
        if (!z) return;
        applyPersonaLinks((m) => (zone.resize ? pl.setZone(m, z.id, { w: z.w + delta.dx, h: z.h + delta.dy }) : pl.setZone(m, z.id, { x: z.x + delta.dx, y: z.y + delta.dy }, ids)));
      } else {
        const moves = Object.fromEntries(ids.map((id) => [id, { x: byId.get(id)!.node.x + delta.dx, y: byId.get(id)!.node.y + delta.dy }]));
        applyPersonaLinks((m) => pl.moveNodes(m, moves));
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const clickNode = (id: Id) => {
    if (tool === 'link') {
      if (!linkFrom) return setLinkFrom(id);
      if (linkFrom === id) return setLinkFrom(null);
      let made: Id | null = null;
      applyPersonaLinks((m) => {
        const r = pl.addRelation(m, linkFrom, id, type?.id ?? '');
        made = r.id;
        return r.links;
      });
      setTool('select');
      if (made) select(`prel:${made}`);
      return;
    }
    if (circles) setPlinks({ plinksCenter: id });
    select(sel === `pnode:${id}` ? null : `pnode:${id}`);
  };

  const suggested = suggest ? pl.suggestions(project, { ...links, nodes: live.map((l) => l.node) }) : [];

  return (
    <div className="board-zoom" style={{ zoom } as CSSProperties}>
      <div className={cls('plinks-doc', tool === 'link' && 'is-linking')} ref={boardRef}>
        <Summary links={links} shownCount={live.length} relations={links.relations.filter((r) => byId.has(r.from) && byId.has(r.to))} centerName={center ? byId.get(center)?.info.name : undefined} />
        <div className="plinks-page" ref={page} style={{ width, height }}>
          {!circles &&
            showZones &&
            links.zones.map((z) => {
              const r = zoneRect(z);
              const inside = pl.nodesInZone(links, z);
              return (
                <div key={z.id} className={cls('plinks-zone', sel === `pzone:${z.id}` && 'is-selected')} style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
                  <div className="plinks-zone-bar">
                    <span className="grip card-btn no-export" title={t('plinks.zoneDrag')} onPointerDown={(e) => follow(e, inside, () => select(`pzone:${z.id}`), { id: z.id, resize: false })}>
                      <GripIcon size={12} />
                    </span>
                    <input
                      className="plinks-zone-title"
                      aria-label={t('plinks.zoneTitle')}
                      placeholder={t('plinks.zoneTitle')}
                      value={z.title}
                      size={Math.max(6, z.title.length + 1)}
                      onFocus={() => select(`pzone:${z.id}`)}
                      onChange={(e) => {
                        const title = e.target.value;
                        applyPersonaLinks((m) => pl.setZone(m, z.id, { title }), { coalesce: `zone-title:${z.id}` });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
                      }}
                    />
                  </div>
                  <span className="plinks-zone-resize no-export" title={t('plinks.zoneResize')} aria-hidden="true" onPointerDown={(e) => follow(e, [], () => select(`pzone:${z.id}`), { id: z.id, resize: true })} />
                </div>
              );
            })}
          {ring && (
            <svg className="plinks-rings" width={width} height={height} aria-hidden="true">
              {ring.rings.map((rr, i) => {
                const c = ring.positions[center!];
                const cx = c.x + pl.NODE_W / 2;
                const cy = c.y + pl.NODE_H / 2;
                return (
                  <g key={i}>
                    <ellipse cx={cx} cy={cy} rx={rr.rx} ry={rr.ry} />
                    <text x={cx - Math.cos(Math.PI / 4) * rr.rx - 8} y={cy - Math.sin(Math.PI / 4) * rr.ry - 8} textAnchor="end">
                      {t(i === 0 ? 'plinks.ring1' : 'plinks.ring2')}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
          {suggested.length > 0 && (
            <svg className="plinks-suggest no-export" width={width} height={height} aria-hidden="true">
              {suggested.map((s) => (
                <path key={`${s.from}|${s.to}`} className={cls(focus && !(focus.has(s.from) && focus.has(s.to)) && 'is-faded')} d={pl.relationPath(posOf(s.from), posOf(s.to), 0).d} />
              ))}
            </svg>
          )}
          <svg className="links plinks-links" width={width} height={height}>
            <defs>
              {links.types.map((ty) => (
                <marker key={ty.id} id={`mm-pl-${ty.id}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" fill={ty.color} style={{ fill: shown(ty.color, 'line') }} />
                </marker>
              ))}
            </defs>
            {shownRelations.map((r) => {
              const ty = typeOf.get(r.type)!;
              const p = pl.relationPath(posOf(r.from), posOf(r.to), offsets.get(r.id) ?? 0);
              const w = pl.strokeWidth(r.strength);
              const dash = pl.dashArray(ty.dash, w);
              const selected = selRel?.id === r.id;
              return (
                <g key={r.id} className={cls(selected && 'is-selected', faded(r) && 'is-faded')}>
                  {selected && <path d={p.d} className="link-halo" fill="none" stroke="#C9D5F6" style={{ stroke: 'var(--link-halo-on)' }} strokeWidth={w + 6} strokeLinecap="round" />}
                  <path
                    d={p.d}
                    className="link-line"
                    fill="none"
                    stroke={ty.color}
                    strokeWidth={w}
                    style={{ stroke: shown(ty.color, 'line'), strokeWidth: w }}
                    strokeLinecap="round"
                    strokeDasharray={dash.length ? dash.join(' ') : undefined}
                    data-width={w}
                    data-head={r.dir === 'to' ? 'end' : r.dir}
                    markerEnd={r.dir !== 'none' ? `url(#mm-pl-${ty.id})` : undefined}
                    markerStart={r.dir === 'both' ? `url(#mm-pl-${ty.id})` : undefined}
                  />
                  <path d={p.d} className="link-hit" role="button" aria-label={t('plinks.kind.relation')} onClick={() => select(`prel:${r.id}`)}>
                    <title>{`${byId.get(r.from)!.info.name} · ${ty.name} · ${byId.get(r.to)!.info.name}`}</title>
                  </path>
                </g>
              );
            })}
          </svg>
          {shownRelations.map((r) => {
            if (!r.label) return null;
            const ty = typeOf.get(r.type)!;
            const p = pl.relationPath(posOf(r.from), posOf(r.to), offsets.get(r.id) ?? 0);
            return (
              <button
                key={r.id}
                className={cls('link-label plinks-label', selRel?.id === r.id && 'is-selected', faded(r) && 'is-faded')}
                style={{ left: p.mid.x, top: p.mid.y, borderColor: shown(ty.color, 'line') }}
                onClick={() => select(`prel:${r.id}`)}
              >
                {r.label}
              </button>
            );
          })}
          {suggested.map((s) => {
            const p = pl.relationPath(posOf(s.from), posOf(s.to), 0);
            const n = s.shared.reduce((sum, m) => sum + m.steps.length, 0);
            const steps = s.shared.map((m) => `${m.steps.join(', ')} (${docLabel(project, m.docId)})`).join(' · ');
            return (
              <button
                key={`${s.from}|${s.to}`}
                className={cls('plinks-suggestion no-export', focus && !(focus.has(s.from) && focus.has(s.to)) && 'is-faded')}
                style={{ left: p.mid.x, top: p.mid.y }}
                title={t('plinks.suggestTitle', { steps, type: type?.name ?? '' })}
                onClick={() => {
                  let made: Id | null = null;
                  applyPersonaLinks((m) => {
                    const r = pl.addRelation(m, s.from, s.to, type?.id ?? '');
                    made = r.id;
                    return r.links;
                  });
                  if (made) select(`prel:${made}`);
                }}
              >
                {n === 1 ? t('plinks.suggestOne') : t('plinks.suggest', { n })}
              </button>
            );
          })}
          {live.map(({ node, info }) => {
            const at = posOf(node.id);
            const { accent, onAccent } = personaAccent(info.color, info.style);
            const count = shownRelations.filter((r) => r.from === node.id || r.to === node.id).length;
            return (
              <div
                key={node.id}
                className={cls(
                  'plinks-node',
                  sel === `pnode:${node.id}` && 'is-selected',
                  linkFrom === node.id && 'is-link-from',
                  focus && !focus.has(node.id) && 'is-faded',
                  drag?.ids.includes(node.id) && !drag.zone && 'is-dragging',
                  center === node.id && 'is-center',
                )}
                style={{ left: at.x, top: at.y, width: pl.NODE_W, height: pl.NODE_H, ['--accent-p' as string]: accent }}
                data-pnode={node.id}
                data-export-above
                role="button"
                tabIndex={0}
                aria-label={`${info.name || t('doc.unnamed')}${info.role ? `, ${info.role}` : ''}`}
                onPointerDown={(e) => (circles || tool === 'link' ? undefined : follow(e, [node.id], () => clickNode(node.id)))}
                onClick={() => (circles || tool === 'link' ? clickNode(node.id) : undefined)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    clickNode(node.id);
                  }
                }}
              >
                <span className="plinks-avatar" style={{ background: accent, color: onAccent }}>
                  {info.photo ? <img src={info.photo} alt="" /> : initials(info.name)}
                </span>
                <span className="plinks-text">
                  <span className="plinks-name">{info.name || t('doc.unnamed')}</span>
                  {info.role && <span className="plinks-role">{info.role}</span>}
                </span>
                {count > 0 && <span className="plinks-count">{count}</span>}
              </div>
            );
          })}
          {live.length === 0 && (
            <div className="plinks-empty no-export">
              <strong>{t('plinks.empty')}</strong>
              <span>{t('plinks.emptyHint')}</span>
            </div>
          )}
          <Bubble links={links} posOf={posOf} width={width} live={byId} relations={shownRelations} />
        </div>
      </div>
    </div>
  );
}

/** Counts, and the legend: one entry per kind of relation, a click shows or hides it. */
function Summary({ links, shownCount, relations, centerName }: { links: PersonaLinks; shownCount: number; relations: Relation[]; centerName?: string }) {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const hidden = useStore((s) => s.plinksHidden);
  const setPlinks = useStore((s) => s.setPlinks);
  const one = (n: number) => isSingular(lang, n);
  return (
    <div className="plinks-summary">
      <span className="plinks-total">
        {t(one(shownCount) ? 'plinks.personaOne' : 'plinks.personas', { n: shownCount })} · {t(one(relations.length) ? 'plinks.linkOne' : 'plinks.links', { n: relations.length })}
      </span>
      <span className="plinks-legend">
        {links.types.map((ty) => {
          const off = hidden.includes(ty.id);
          const n = relations.filter((r) => r.type === ty.id).length;
          return (
            <button
              key={ty.id}
              className={cls('plinks-legend-item', off && 'is-off no-export')}
              aria-pressed={!off}
              title={t('plinks.legendToggle', { name: ty.name || t('plinks.untitledType') })}
              onClick={() => setPlinks({ plinksHidden: off ? hidden.filter((h) => h !== ty.id) : [...hidden, ty.id] })}
            >
              <LineSample type={ty} />
              <span>{ty.name || t('plinks.untitledType')}</span>
              <span className="plinks-legend-count">{n}</span>
            </button>
          );
        })}
      </span>
      {centerName !== undefined && <span className="plinks-centered">{t('plinks.centered', { name: centerName || t('doc.unnamed') })}</span>}
    </div>
  );
}

const arrowOf = (r: Relation, mine: boolean) => (r.dir === 'none' ? '—' : r.dir === 'both' ? '↔' : mine ? '→' : '←');

/** Next to the chosen persona or relation: its relations and journeys, or the steps the pair shares. */
function Bubble(props: { links: PersonaLinks; posOf: (id: Id) => { x: number; y: number }; width: number; live: Map<Id, { info: pl.PersonaInfo }>; relations: Relation[] }) {
  const { links, posOf, width, live, relations } = props;
  const t = useT();
  const sel = useStore((s) => s.sel);
  const project = useStore((s) => s.project);
  const setDoc = useStore((s) => s.setDoc);
  const select = useStore((s) => s.select);
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    if (ref.current) setH(ref.current.offsetHeight);
  });
  const typeOf = (id: Id) => links.types.find((ty) => ty.id === id);
  let body: React.ReactNode = null;
  let anchor: { x: number; y: number; w: number } | null = null;
  if (sel?.startsWith('pnode:') && live.has(sel.slice(6))) {
    const id = sel.slice(6);
    const { info } = live.get(id)!;
    const mine = relations.filter((r) => r.from === id || r.to === id);
    const maps = info.ref.kind === 'persona' ? (pl.personaSteps(project).get(info.ref.id) ?? []) : [];
    const flows = info.ref.kind === 'persona' ? personaFlows(project, info.ref.id) : [];
    body = (
      <>
        <div className="plinks-pop-head">
          <strong>{info.name || t('doc.unnamed')}</strong>
          {info.role && <span className="muted-sm">{info.role}</span>}
        </div>
        <span className="plinks-pop-title">{t('plinks.bubble.relations', { n: mine.length })}</span>
        {mine.length === 0 ? (
          <span className="muted-sm">{t('plinks.bubble.none')}</span>
        ) : (
          <ul className="plinks-pop-list">
            {mine.map((r) => {
              const ty = typeOf(r.type);
              const other = live.get(r.from === id ? r.to : r.from)?.info;
              return (
                <li key={r.id}>
                  <button className="plinks-pop-row" onClick={() => select(`prel:${r.id}`)}>
                    {ty && <LineSample type={{ ...ty, dir: 'none' }} width={18} />}
                    <span>
                      {ty?.name || t('plinks.untitledType')} {arrowOf(r, r.from === id)} {other?.name || t('doc.unnamed')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <span className="plinks-pop-title">{t('plinks.bubble.journeys')}</span>
        {maps.length === 0 && flows.length === 0 ? (
          <span className="muted-sm">{t('plinks.bubble.noJourney')}</span>
        ) : (
          <ul className="plinks-pop-list">
            {maps.map((m) => (
              <li key={m.docId}>
                <button className="plinks-pop-row plinks-pop-link" title={t('links.open', { name: docLabel(project, m.docId) })} onClick={() => setDoc(m.docId)}>
                  <span>
                    <b>{docLabel(project, m.docId)}</b> <span className="muted-sm">{m.steps.join(', ')}</span>
                  </span>
                </button>
              </li>
            ))}
            {flows.map((f) => (
              <li key={f.id}>
                <button className="plinks-pop-row plinks-pop-link" title={t('links.open', { name: docLabel(project, f.id) })} onClick={() => setDoc(f.id)}>
                  <b>{docLabel(project, f.id)}</b>
                </button>
              </li>
            ))}
          </ul>
        )}
      </>
    );
    const at = posOf(id);
    anchor = { x: at.x, y: at.y, w: pl.NODE_W };
  } else if (sel?.startsWith('prel:')) {
    const r = relations.find((x) => x.id === sel.slice(5));
    const a = r && live.get(r.from)?.info;
    const b = r && live.get(r.to)?.info;
    if (r && a && b) {
      const ty = typeOf(r.type);
      const shared = pl.sharedSteps(pl.personaSteps(project), a.ref, b.ref);
      body = (
        <>
          <div className="plinks-pop-head">
            <strong>
              {ty?.name || t('plinks.untitledType')}
              {r.label ? ` · ${r.label}` : ''}
            </strong>
            <span className="muted-sm">
              {a.name || t('doc.unnamed')} {arrowOf(r, true)} {b.name || t('doc.unnamed')} · {t('plinks.strengthN', { n: r.strength ?? 2 })}
            </span>
          </div>
          <span className="plinks-pop-title">{t('plinks.bubble.shared')}</span>
          {shared.length === 0 ? (
            <span className="muted-sm">{t('plinks.bubble.noShared')}</span>
          ) : (
            <ul className="plinks-pop-list">
              {shared.map((m) => (
                <li key={m.docId}>
                  <button className="plinks-pop-row plinks-pop-link" title={t('links.open', { name: docLabel(project, m.docId) })} onClick={() => setDoc(m.docId)}>
                    <span>
                      <b>{docLabel(project, m.docId)}</b> <span className="muted-sm">{m.steps.join(', ')}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      );
      const p = pl.relationPath(posOf(r.from), posOf(r.to), pl.relationOffsets(relations).get(r.id) ?? 0);
      anchor = { x: p.mid.x - 10, y: p.mid.y + 18, w: 20 };
    }
  }
  if (!body || !anchor) return null;
  const W = 280;
  const right = anchor.x + anchor.w + 14;
  const left = right + W <= width ? right : Math.max(4, anchor.x - W - 14);
  return (
    <div ref={ref} className="plinks-pop no-export" style={{ left, top: Math.max(4, anchor.y - (h > 200 ? 20 : 0)), width: W }}>
      {body}
    </div>
  );
}
