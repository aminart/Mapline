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
import { LINK_COLORS, LINK_DASH, personaAccent } from '../model/theme';
import type { Flow, FlowNode, FlowNodeKind } from '../model/types';
import { routeFlow, type RoutedLink } from '../lib/flowRoute';
import { pointAlong, roundedPath } from '../lib/arrows';
import { boardRef } from './Board';
import { useBox } from './useBox';
import { startDrag, useDropTarget } from './dnd';
import { CloseIcon, GripIcon, PlusIcon } from './Icons';
import { cls } from './cls';

const DIRECTIONS: fo.Direction[] = ['up', 'right', 'down', 'left'];

/** A flow: cards on a grid, arrows between them. */
export function FlowView() {
  const zoom = useStore((s) => s.zoom);
  const flow = useStore((s) => activeFlow(s));
  // Height each card's text needs, measured once drawn: rows grow to fit.
  const [measured, setMeasured] = useState<Record<Id, number>>({});
  const onMeasure = useCallback((id: Id, h: number) => setMeasured((m) => (Math.abs((m[id] ?? 0) - h) < 1 ? m : { ...m, [id]: h })), []);
  if (!flow) return null;
  const layout = flowLayout(flow, measured);
  const { cols, rows } = fo.extent(flow);
  // One spare column and row, to drop a card past the edge.
  const size = flowSize(cols + 1, rows + 1, layout);
  const routed = routeFlow(flow, layout);
  const empty: [number, number][] = [];
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) if (!fo.nodeAt(flow, c, r)) empty.push([c, r]);
  return (
    <div className="board-zoom" style={{ zoom } as CSSProperties}>
      <div className="flow" ref={boardRef} style={{ width: size.w, height: size.h }}>
        {empty.map(([c, r]) => (
          <DropCell key={`${c}:${r}`} col={c} row={r} layout={layout} />
        ))}
        <Arrows routed={routed} width={size.w} height={size.h} />
        {flow.nodes.map((node) => (
          <FlowCard key={node.id} node={node} layout={layout} onMeasure={onMeasure} />
        ))}
        <TagSuggestions id={FLOW_TAG_LIST} tags={fo.flowTagCounts(flow).map((x) => x.tag)} />
        {routed.map((r) => (
          <ArrowExtras key={r.link.id} routed={r} />
        ))}
      </div>
    </div>
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

function Arrows({ routed, width, height }: { routed: RoutedLink[]; width: number; height: number }) {
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
        return (
          <g key={link.id}>
            <path d={d} className="link-halo" fill="none" stroke={selected ? '#C9D5F6' : '#FFFFFF'} strokeWidth={selected ? 8 : 5} strokeLinecap="round" />
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
function ArrowExtras({ routed }: { routed: RoutedLink }) {
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
        <button className={cls('link-label', sel === `flink:${link.id}` && 'is-selected')} style={{ left: at.x, top: at.y, color, borderColor: color }} onClick={() => select(`flink:${link.id}`)}>
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

function FlowCard({ node, layout, onMeasure }: { node: FlowNode; layout: FlowLayout; onMeasure: (id: Id, h: number) => void }) {
  const t = useT();
  const applyFlow = useStore((s) => s.applyFlow);
  const focusLater = useStore((s) => s.focusLater);
  const project = useStore((s) => s.project);
  const tool = useStore((s) => s.tool);
  const linkFrom = useStore((s) => s.linkFrom);
  const setLinkFrom = useStore((s) => s.setLinkFrom);
  const b = useBox<HTMLTextAreaElement & HTMLInputElement>(`node:${node.id}`, 'node');
  const ref = useRef<HTMLDivElement>(null);
  const drop = useDropTarget('fnode', (d) => applyFlow((f) => fo.moveNode(f, d.id, node.col, node.row)));
  const tagFilter = useStore((s) => s.tagFilter);
  const tagColors = useStore((s) => activeFlow(s)?.tagColors);
  const content = useRef<HTMLDivElement>(null);
  const box = nodeBox(node, layout);
  const persona = node.personaId ? projectPersonas(project).find((p) => p.persona.id === node.personaId) : undefined;
  const tags = node.tags ?? [];
  const dimmed = tagFilter.length > 0 && !tags.some((tag) => tagFilter.includes(tag.toLowerCase()));
  const accent = persona ? personaAccent(persona.persona.color, persona.style).accent : node.kind === 'choice' ? '#A16207' : '#2F55D4';
  const pill = node.kind === 'start' || node.kind === 'end';

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
    if (!el || pill) return;
    const report = () => onMeasure(node.id, el.offsetHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [node.id, pill, onMeasure]);

  return (
    <div
      ref={ref}
      className={cls('box flow-card', `flow-${node.kind}`, b.selected && 'is-selected', drop.over && 'is-drop-target', dimmed && 'is-dimmed')}
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        // Start and end are dark pills: the card fill applies to activities and choices.
        ...(pill ? {} : { ...b.box, borderTopColor: accent }),
      }}
      data-node={node.id}
      {...drop.props}
      onClick={(e) => {
        // A click in the card's empty space edits its text.
        if (e.target === e.currentTarget || e.target === content.current) b.ref.current?.focus();
      }}
    >
      {pill ? (
        <input ref={b.ref} className="flow-pill-text" aria-label={t('flow.cardText')} value={node.text} placeholder={t(`flow.kind.${node.kind}`)} onFocus={b.onFocus} onChange={(e) => setText(e.target.value)} />
      ) : (
        <div className="flow-card-content" ref={content}>
          {node.kind === 'choice' && (
        <span className="flow-choice-tag" aria-hidden="true">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 2l10 10-10 10L2 12z" />
          </svg>
          {t('flow.kind.choice')}
            </span>
          )}
          {persona && (
            <span className="flow-persona" style={{ background: accent }} title={persona.persona.name} aria-label={persona.persona.name}>
              {persona.photo ? <img src={persona.photo} alt="" /> : (persona.persona.name || '?').charAt(0).toUpperCase()}
            </span>
          )}
          <textarea
            ref={b.ref}
            rows={1}
            className="flow-text"
            aria-label={t('flow.cardText')}
            value={node.text}
            placeholder={t(node.kind === 'choice' ? 'flow.choicePlaceholder' : 'flow.activityPlaceholder')}
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
          />
        </div>
      )}
      {!pill && <NoteButton note={node.note ?? ''} onChange={(v, live) => applyFlow((f) => fo.setNodeNote(f, node.id, v), live ? { coalesce: `fnote:${node.id}` } : undefined)} />}
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

