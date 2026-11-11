// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { activeFlow, useStore, useT } from '../store';
import * as fo from '../model/flow';
import { cellBox, flowLayout, flowSize, nodeBox, type FlowLayout } from '../model/flowLayout';
import { projectPersonas } from '../model/project';
import type { Id } from '../model/types';
import { NoteButton, TagRow, TagSuggestions } from './CardExtras';
import { useFitText } from './useFitText';
import { FitText } from './FitText';
import { LINK_COLORS, LINK_DASH, flowCardTop, personaAccent } from '../model/theme';
import type { Flow, FlowNode, FlowNodeKind } from '../model/types';
import { routeFlow, type RoutedLink } from '../lib/flowRoute';
import { pointAlong, roundedPath } from '../lib/arrows';
import { boardRef } from './Board';
import { useBox } from './useBox';
import { startDrag, useDropTarget } from './dnd';
import { ChevronLeft, CloseIcon, GripIcon, PlusIcon } from './Icons';
import { resolveSource, setFlowPersona } from '../model/links';
import { docLabel } from '../actions';
import { cls } from './cls';
import { useFlowDiff, useFlowFocus, useFlowMerged } from './useDiff';
import { BaseArrows, BaseCard } from './FlowCompare';
import { showTwin } from './compareNav';
import { placeGhosts, type LinkDiff } from '../model/states';
import { FlowPresentationFocus } from './Presentation';
import { BeforeText, ChangeTag } from './ChangeMarks';

const DIRECTIONS: fo.Direction[] = ['up', 'right', 'down', 'left'];

/** Measures text widths, for the start and end pills. */
let measureCanvas: HTMLCanvasElement | undefined;

/** A flow: cards on a grid, arrows between them. */
export function FlowView() {
  const zoom = useStore((s) => s.zoom);
  const flow = useStore((s) => activeFlow(s));
  // Height each card's text needs, measured once drawn: rows grow to fit.
  const [measured, setMeasured] = useState<Record<Id, number>>({});
  const onMeasure = useCallback((id: Id, h: number) => setMeasured((m) => (Math.abs((m[id] ?? 0) - h) < 1 ? m : { ...m, [id]: h })), []);
  // And the width a pill's text needs on one line.
  const [widths, setWidths] = useState<Record<Id, number>>({});
  const onMeasureWidth = useCallback((id: Id, w: number) => setWidths((m) => (Math.abs((m[id] ?? 0) - w) < 1 ? m : { ...m, [id]: w })), []);
  const compared = useFlowDiff();
  const presenting = useStore((s) => s.presentStep !== null);
  const merged = useFlowMerged() && !presenting;
  const focus = useFlowFocus();
  if (!flow) return null;
  // Compared with its removed cards drawn over it: they take part in the layout.
  const ghosts = merged && compared ? placeGhosts(flow, compared.diff.removed) : [];
  const shown: Flow = ghosts.length ? { ...flow, nodes: flow.nodes.concat(ghosts) } : flow;
  const layout = flowLayout(shown, measured, widths);
  const { cols, rows } = fo.extent(shown);
  // One spare column and row, to drop a card past the edge.
  const size = flowSize(cols + 1, rows + 1, layout);
  const routed = routeFlow(ghosts.length ? { ...shown, links: flow.links } : flow, layout);
  const ids = new Set(shown.nodes.map((n) => n.id));
  const ghostLinks = merged && compared ? compared.links.removed.filter((l) => ids.has(l.from) && ids.has(l.to)) : [];
  const ghostRouted = ghostLinks.length ? routeFlow({ ...shown, links: ghostLinks }, layout) : [];
  const empty: [number, number][] = [];
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) if (!fo.nodeAt(flow, c, r)) empty.push([c, r]);
  const original = new Map(compared?.diff.removed.map((n) => [n.id, n]));
  // Presenting column by column, an arrow shows with the later of its two cards.
  const colOf = new Map(shown.nodes.map((n) => [n.id, n.col]));
  const reveal = (link: { from: Id; to: Id }) => Math.max(colOf.get(link.from) ?? 0, colOf.get(link.to) ?? 0);

  return (
    <div className="board-zoom" style={{ zoom } as CSSProperties}>
      <div className="flow-doc" ref={boardRef} style={{ width: Math.max(size.w, 640) }}>
      <FlowHeader flow={flow} />
      <FlowBrief flow={flow} />
      <FlowPresentationFocus />
      <div className={cls('flow', focus && 'diff-focus')} style={{ width: size.w, height: size.h }}>
        {empty.map(([c, r]) => (
          <DropCell key={`${c}:${r}`} col={c} row={r} layout={layout} />
        ))}
        {ghostRouted.length > 0 && (
          <BaseArrows routed={ghostRouted} removed={new Set(ghostLinks.map((l) => l.id))} comparing prefix="ghost" width={size.w} height={size.h} />
        )}
        <Arrows routed={routed} width={size.w} height={size.h} links={compared?.links} reveal={reveal} />
        {flow.nodes.map((node) => (
          <FlowCard key={node.id} node={node} layout={layout} onMeasure={onMeasure} onMeasureWidth={onMeasureWidth} />
        ))}
        {compared &&
          ghosts.map((node) => (
            <BaseCard key={node.id} flow={compared.base} node={node} original={original.get(node.id)} layout={layout} change="removed" comparing ghost onMeasure={onMeasure} />
          ))}
        <TagSuggestions id={FLOW_TAG_LIST} tags={fo.flowTagCounts(flow).map((x) => x.tag)} />
        {routed.map((r) => (
          <ArrowExtras key={r.link.id} routed={r} change={linkChange(compared?.links, r.link.id)} reveal={reveal(r.link)} />
        ))}
      </div>
      </div>
    </div>
  );
}

/** How an arrow changed since the current state, while comparing: 'same' when it didn't. */
function linkChange(links: LinkDiff | undefined, id: Id): 'added' | 'modified' | 'same' | undefined {
  if (!links) return undefined;
  return links.added.includes(id) ? 'added' : links.modified.includes(id) ? 'modified' : 'same';
}

const LINK_DIFF_COLORS = { added: '#12B76A', modified: '#F79009' } as const;

/** What the flow details (a link back to the map) and its main persona. */
function FlowHeader({ flow }: { flow: Flow }) {
  const t = useT();
  const project = useStore((s) => s.project);
  const applyFlow = useStore((s) => s.applyFlow);
  const setDoc = useStore((s) => s.setDoc);
  const focusLater = useStore((s) => s.focusLater);
  const source = resolveSource(project, flow.source);
  const personas = projectPersonas(project);
  const main = personas.find((p) => p.persona.id === flow.personaId);
  const { accent, onAccent } = main ? personaAccent(main.persona.color, main.style) : { accent: '#5B6270', onAccent: '#FFFFFF' };
  if (!source && personas.length === 0) return null;
  const title = source?.title.trim() || t('links.untitled');
  const label = !source ? '' : source.source.kind === 'phase' ? t('links.phase', { title }) : source.source.kind === 'step' ? t('links.step', { n: source.step, title }) : t('links.act', { title });
  const back = () => {
    if (!source) return;
    setDoc(source.source.docId);
    focusLater(`${source.source.kind}:${source.source.id}`);
  };
  return (
    <div className={cls('flow-header', !source && !main && 'no-export')}>
      {source && (
        <button className="flow-source" title={t('links.back', { name: docLabel(project, source.source.docId) })} onClick={back}>
          <span className="no-export">
            <ChevronLeft size={12} />
          </span>
          {t('links.details')} : <strong>{label}</strong>
          <span className="muted-sm">({docLabel(project, source.source.docId)})</span>
        </button>
      )}
      <span className="flow-header-gap" />
      {personas.length > 0 && (
        <label className={cls('flow-main-persona', !main && 'no-export')}>
          <span className="muted-sm">{t('flow.mainPersona')}</span>
          <span className="flow-main-pill">
            <span className="flow-main-avatar" style={{ background: accent, color: onAccent }} aria-hidden="true">
              {main?.photo ? <img src={main.photo} alt="" /> : (main?.persona.name || '?').charAt(0).toUpperCase()}
            </span>
            {/* The name alone in exports, where a menu would show its arrow. */}
            {main && <span className="flow-main-name">{main.persona.name || t('doc.unnamed')}</span>}
            <select
              className="no-export"
              aria-label={t('flow.mainPersonaLabel')}
              value={flow.personaId ?? ''}
              onChange={(e) => {
                const v = e.target.value || null;
                applyFlow((f) => setFlowPersona(f, v));
              }}
            >
              <option value="">{t('flow.noPersona')}</option>
              {personas.map(({ persona }) => (
                <option key={persona.id} value={persona.id}>
                  {persona.name || t('doc.unnamed')}
                </option>
              ))}
            </select>
          </span>
        </label>
      )}
    </div>
  );
}

/** Free text above the cards: the flow's goals, say, under a title of one's own. */
function FlowBrief({ flow }: { flow: Flow }) {
  const t = useT();
  const applyFlow = useStore((s) => s.applyFlow);
  const docId = useStore((s) => s.docId);
  const ref = useRef<HTMLTextAreaElement>(null);
  const text = flow.brief ?? '';
  useFitText(ref, [text]);
  return (
    <section className={cls('box flow-brief', !text.trim() && 'no-export')}>
      <FitText
        singleLine
        className="flow-brief-title"
        aria-label={t('flow.briefTitleLabel')}
        placeholder={t('flow.briefTitle')}
        value={flow.briefTitle ?? t('flow.briefTitle')}
        onChange={(e) => {
          const v = e.target.value;
          applyFlow((f) => fo.setBrief(f, { briefTitle: v }), { coalesce: `brief-title:${docId}` });
        }}
      />
      <textarea
        ref={ref}
        rows={2}
        className="flow-brief-text"
        aria-label={t('flow.briefLabel')}
        placeholder={t('flow.briefPlaceholder')}
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          applyFlow((f) => fo.setBrief(f, { brief: v }), { coalesce: `brief:${docId}` });
        }}
      />
    </section>
  );
}

/** An empty cell a dragged card can be dropped on (shown while dragging). */
const FLOW_TAG_LIST = 'mm-flow-tag-list';

function DropCell({ col, row, layout }: { col: number; row: number; layout: FlowLayout }) {
  const applyFlow = useStore((s) => s.applyFlow);
  const drop = useDropTarget('fnode', (d) => applyFlow((f) => fo.moveNode(f, d.id, col, row)));
  const box = cellBox(col, row, layout);
  return <div className={cls('flow-drop no-export', drop.over && 'is-drop-target')} style={{ left: box.x, top: box.y, width: box.w, height: box.h }} {...drop.props} />;
}

function Arrows(props: { routed: RoutedLink[]; width: number; height: number; links?: LinkDiff; reveal: (link: { from: Id; to: Id }) => number }) {
  const { routed, width, height, links, reveal } = props;
  const t = useT();
  const sel = useStore((s) => s.sel);
  const select = useStore((s) => s.select);
  return (
    <svg className="links" width={width} height={height}>
      <defs>
        {routed.map(({ link }) => (
          <marker key={link.id} id={`mm-flow-${link.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill={link.color ?? LINK_COLORS[0]} />
          </marker>
        ))}
      </defs>
      {routed.map(({ link, points }) => {
        const d = roundedPath(points);
        const selected = sel === `flink:${link.id}`;
        const dash = LINK_DASH[link.style ?? 'solid'];
        const change = linkChange(links, link.id);
        const marked = change === 'added' || change === 'modified' ? change : null;
        return (
          <g key={link.id} className={cls(change && `diff-${change}-link`, change === 'same' && 'diff-same')} data-link={link.id} data-reveal={reveal(link)}>
            {marked && !selected ? (
              <path d={d} className="link-halo link-diff-halo" fill="none" stroke={LINK_DIFF_COLORS[marked]} strokeWidth={7} strokeLinecap="round" />
            ) : (
              <path d={d} className="link-halo" fill="none" stroke={selected ? '#C9D5F6' : '#FFFFFF'} strokeWidth={selected ? 8 : 5} strokeLinecap="round" />
            )}
            <path
              d={d}
              className="link-line"
              fill="none"
              stroke={link.color ?? LINK_COLORS[0]}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeDasharray={dash.length ? dash.join(' ') : undefined}
              markerEnd={`url(#mm-flow-${link.id})`}
            />
            <path d={d} className="link-hit" role="button" aria-label={t('flow.selectArrow')} onClick={() => select(`flink:${link.id}`)}>
              <title>{t('flow.selectArrow')}</title>
            </path>
          </g>
        );
      })}
    </svg>
  );
}

/** An arrow's label, and the ⊕ that inserts a card on it. */
function ArrowExtras({ routed, change, reveal }: { routed: RoutedLink; change?: 'added' | 'modified' | 'same'; reveal: number }) {
  const t = useT();
  const sel = useStore((s) => s.sel);
  const select = useStore((s) => s.select);
  const applyFlow = useStore((s) => s.applyFlow);
  const focusLater = useStore((s) => s.focusLater);
  const [menu, setMenu] = useState(false);
  const { link, points } = routed;
  const color = link.color ?? LINK_COLORS[0];
  // The label near the start (choices name their branches), the ⊕ halfway.
  const at = pointAlong(points, link.label ? 0.25 : 0.5);
  const mid = pointAlong(points, link.label ? 0.6 : 0.5);
  const insert = (kind: FlowNodeKind) => {
    let id: string | null = null;
    applyFlow((f) => {
      const r = fo.insertOnLink(f, link.id, kind);
      id = r.nodeId;
      return r.flow;
    });
    setMenu(false);
    if (id) focusLater(`node:${id}`);
  };
  return (
    <>
      {link.label && (
        <button className={cls('link-label', sel === `flink:${link.id}` && 'is-selected', change && `diff-${change}-label`, change === 'same' && 'diff-same')} style={{ left: at.x, top: at.y, color, borderColor: color }} data-reveal={reveal} onClick={() => select(`flink:${link.id}`)}>
          {link.label}
        </button>
      )}
      <div className={cls('flow-insert no-export', menu && 'is-open')} style={{ left: mid.x, top: mid.y }}>
        <button className="flow-insert-btn" aria-label={t('flow.insertHere')} title={t('flow.insertHere')} onClick={() => setMenu(!menu)}>
          <PlusIcon size={12} />
        </button>
        {menu && (
          <div className="flow-insert-menu">
            <button className="btn btn-sm" onClick={() => insert('activity')}>
              {t('flow.kind.activity')}
            </button>
            <button className="btn btn-sm" onClick={() => insert('choice')}>
              {t('flow.kind.choice')}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function FlowCard(props: { node: FlowNode; layout: FlowLayout; onMeasure: (id: Id, h: number) => void; onMeasureWidth: (id: Id, w: number) => void }) {
  const { node, layout, onMeasure, onMeasureWidth } = props;
  const t = useT();
  const applyFlow = useStore((s) => s.applyFlow);
  const focusLater = useStore((s) => s.focusLater);
  const project = useStore((s) => s.project);
  const tool = useStore((s) => s.tool);
  const linkFrom = useStore((s) => s.linkFrom);
  const setLinkFrom = useStore((s) => s.setLinkFrom);
  const b = useBox<HTMLTextAreaElement>(`node:${node.id}`, 'node');
  const ref = useRef<HTMLDivElement>(null);
  const drop = useDropTarget('fnode', (d) => applyFlow((f) => fo.moveNode(f, d.id, node.col, node.row)));
  const tagFilter = useStore((s) => s.tagFilter);
  const tagColors = useStore((s) => activeFlow(s)?.tagColors);
  const content = useRef<HTMLDivElement>(null);
  const box = nodeBox(node, layout);
  const flowPersona = useStore((s) => activeFlow(s)?.personaId);
  const allPersonas = projectPersonas(project);
  // The card's own personas, each shown on its corner; the first one's colour tops the card.
  const own = fo.nodePersonas(node).flatMap((id) => allPersonas.filter((p) => p.persona.id === id));
  // Cards without a persona of their own take the flow's main persona's colour.
  const persona = own[0] ?? (flowPersona ? allPersonas.find((p) => p.persona.id === flowPersona) : undefined);
  const tags = node.tags ?? [];
  const dimmed = tagFilter.length > 0 && !tags.some((tag) => tagFilter.includes(tag.toLowerCase()));
  const accent = persona ? personaAccent(persona.persona.color, persona.style).accent : node.kind === 'choice' ? '#A16207' : '#2F55D4';
  const pill = node.kind === 'start' || node.kind === 'end';
  const compared = useFlowDiff();
  const change = compared?.diff.changes[node.id];
  const before = compared?.diff.before[node.id];

  const add = (dir: fo.Direction) => {
    let id: string | null = null;
    applyFlow((f) => {
      const r = fo.addNode(f, node.id, dir);
      id = r.nodeId;
      return r.flow;
    });
    if (id) focusLater(`node:${id}`);
  };
  const pick = () => {
    if (!linkFrom) setLinkFrom(node.id);
    else if (linkFrom === node.id) setLinkFrom(null);
    else {
      applyFlow((f: Flow) => fo.toggleFlowLink(f, linkFrom, node.id));
      setLinkFrom(null);
    }
  };
  const setText = (text: string) => applyFlow((f) => fo.setNode(f, node.id, { text }), { coalesce: `node:${node.id}` });
  const isSource = linkFrom === node.id;

  // The text area grows with its text; the card reports the height it needs.
  const noText = useRef<HTMLTextAreaElement>(null);
  useFitText(pill ? noText : b.ref, [node.text, b.text.fontFamily, b.text.fontSize, b.text.fontWeight]);
  useLayoutEffect(() => {
    const el = content.current;
    if (!el) return;
    const report = () => onMeasure(node.id, el.offsetHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [node.id, pill, onMeasure]);
  // A pill as wide as its text on one line, up to its cell.
  const placeholder = t(pill ? `flow.kind.${node.kind}` : node.kind === 'choice' ? 'flow.choicePlaceholder' : 'flow.activityPlaceholder');
  useLayoutEffect(() => {
    const el = b.ref.current;
    if (!el || !pill) return;
    const measure = () => {
      const css = getComputedStyle(el);
      const ctx = (measureCanvas ??= document.createElement('canvas')).getContext('2d');
      if (!ctx) return;
      ctx.font = css.font;
      const pad = parseFloat(css.paddingLeft) + parseFloat(css.paddingRight);
      onMeasureWidth(node.id, ctx.measureText(node.text || placeholder).width + pad + 2);
    };
    measure();
    document.fonts?.ready.then(measure);
  }, [b.ref, node.id, node.text, pill, placeholder, onMeasureWidth]);

  return (
    <div
      ref={ref}
      className={cls('box flow-card', `flow-${node.kind}`, b.selected && 'is-selected', drop.over && 'is-drop-target', dimmed && 'is-dimmed', change ? `diff-${change}` : compared && 'diff-same')}
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        // Start and end are dark pills: the card fill applies to activities and choices.
        ...(pill ? {} : { ...b.box, borderTopColor: flowCardTop(b.custom, accent) }),
      }}
      data-node={node.id}
      data-reveal={node.col}
      {...drop.props}
      onPointerEnter={compared ? () => showTwin(node.id, 'target', true) : undefined}
      onPointerLeave={compared ? () => showTwin(node.id, 'target', false) : undefined}
      onClick={(e) => {
        // A click in the card's empty space edits its text.
        if (e.target === e.currentTarget || e.target === content.current) b.ref.current?.focus();
      }}
    >
      {pill ? (
        <div className="flow-card-content" ref={content}>
          <FitText ref={b.ref} singleLine className="flow-pill-text" aria-label={t('flow.cardText')} value={node.text} placeholder={placeholder} onFocus={b.onFocus} onChange={(e) => setText(e.target.value)} />
        </div>
      ) : (
        <div className="flow-card-content" ref={content}>
          {change && <ChangeTag change={change} />}
          {node.kind === 'choice' && (
        <span className="flow-choice-tag" aria-hidden="true">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 2l10 10-10 10L2 12z" />
          </svg>
          {t('flow.kind.choice')}
            </span>
          )}
          {own.length > 0 && (
            <span className="flow-personas" title={own.map((p) => p.persona.name || t('doc.unnamed')).join(', ')}>
              {own.map((p) => (
                <span key={p.persona.id} className="flow-persona" style={{ background: personaAccent(p.persona.color, p.style).accent }} aria-label={p.persona.name || t('doc.unnamed')}>
                  {p.photo ? <img src={p.photo} alt="" /> : (p.persona.name || '?').charAt(0).toUpperCase()}
                </span>
              ))}
            </span>
          )}
          <textarea
            ref={b.ref}
            rows={1}
            className="flow-text"
            aria-label={t('flow.cardText')}
            value={node.text}
            placeholder={placeholder}
            onFocus={b.onFocus}
            onChange={(e) => setText(e.target.value)}
            style={b.text}
          />
          <TagRow
            tags={tags}
            colors={tagColors}
            listId={FLOW_TAG_LIST}
            onAdd={(tag) => applyFlow((f) => fo.addNodeTag(f, node.id, tag))}
            onRemove={(tag) => applyFlow((f) => fo.removeNodeTag(f, node.id, tag))}
            onRename={(from, to, everywhere) => applyFlow((f) => fo.renameNodeTag(f, everywhere ? null : node.id, from, to))}
            onColor={(tag, i) => applyFlow((f) => fo.setFlowTagColor(f, tag, i))}
            uses={(tag) => {
              const f = activeFlow(useStore.getState());
              return f ? fo.flowTagUses(f, tag) : 0;
            }}
          />
          {change && before !== undefined && <BeforeText text={before} />}
        </div>
      )}
      {!pill && (
        <NoteButton
          note={node.note ?? ''}
          onChange={(v, live) => applyFlow((f) => fo.setNodeNote(f, node.id, v), live ? { coalesce: `fnote:${node.id}` } : undefined)}
          resolved={Boolean(node.noteResolved)}
          onResolve={(r) => applyFlow((f) => fo.setNodeNoteResolved(f, node.id, r))}
        />
      )}
      <span className="grip flow-grip card-btn no-export" title={t('flow.drag')} aria-hidden="true" onPointerDown={(e) => startDrag(e, { kind: 'fnode', id: node.id }, ref.current)}>
        <GripIcon size={12} />
      </span>
      <button className="card-btn card-del no-export" aria-label={t('flow.remove')} title={t('flow.remove')} onClick={() => applyFlow((f) => fo.removeNode(f, node.id))}>
        <CloseIcon size={12} />
      </button>
      {b.selected && tool === 'select' &&
        DIRECTIONS.map((dir) => (
          <button key={dir} className={cls('flow-handle no-export', `flow-handle-${dir}`)} aria-label={t(`flow.add.${dir}`)} title={t(`flow.add.${dir}`)} onClick={() => add(dir)}>
            <PlusIcon size={12} />
          </button>
        ))}
      {tool === 'link' && (
        <button className={cls('link-target no-export', isSource && 'is-source')} aria-label={t(isSource ? 'flow.linkCancel' : linkFrom ? 'flow.linkTo' : 'flow.linkFrom')} onClick={pick} />
      )}
    </div>
  );
}

