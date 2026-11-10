// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useStore, useT } from '../store';
import * as fo from '../model/flow';
import { flowLayout, flowSize, nodeBox, type FlowLayout } from '../model/flowLayout';
import { projectPersonas } from '../model/project';
import { baselineOf, restoreNode, type Change } from '../model/states';
import type { Flow, FlowNode, Id } from '../model/types';
import { routeFlow, type RoutedLink } from '../lib/flowRoute';
import { pointAlong, roundedPath } from '../lib/arrows';
import { LINK_COLORS, LINK_DASH, boxStyle, personaAccent, resolveStyle, textStyle } from '../model/theme';
import { useFlowDiff, useFlowFocus } from './useDiff';
import { showTwin } from './compareNav';
import { ChangeTag } from './ChangeMarks';
import { cls } from './cls';

/**
 * The current state of the flow shown, read only, over its target: cards
 * since removed or changed are marked.
 */
export function BaseFlow() {
  const t = useT();
  const zoom = useStore((s) => s.zoom);
  const base = useStore((s) => baselineOf(s.project, s.docId));
  const compared = useFlowDiff();
  const focus = useFlowFocus();
  const [measured, setMeasured] = useState<Record<Id, number>>({});
  const onMeasure = useCallback((id: Id, h: number) => setMeasured((m) => (Math.abs((m[id] ?? 0) - h) < 1 ? m : { ...m, [id]: h })), []);
  if (base?.kind !== 'flow') return null;
  const flow = base.flow;
  const layout = flowLayout(flow, measured);
  const { cols, rows } = fo.extent(flow);
  // The same spare column and row as the target, so both line up.
  const size = flowSize(cols + 1, rows + 1, layout);
  const removed = new Set(compared?.diff.removed.map((n) => n.id));
  const removedLinks = new Set(compared?.links.removed.map((l) => l.id));
  return (
    <div className="board-zoom" style={{ zoom } as CSSProperties}>
      <div className="flow-doc flow-base" style={{ width: Math.max(size.w, 640) }}>
        <div className="flow-base-title">
          <span className="state-badge">{t('state.current')}</span>
          <span className="muted-sm">{t('state.readOnly')}</span>
        </div>
        <div className={cls('flow', focus && 'diff-focus')} style={{ width: size.w, height: size.h }}>
          <BaseArrows routed={routeFlow(flow, layout)} removed={removedLinks} comparing={!!compared} prefix="base" width={size.w} height={size.h} />
          {routeFlow(flow, layout)
            .filter(({ link }) => link.label)
            .map(({ link, points }) => {
              const at = pointAlong(points, 0.25);
              const color = link.color ?? LINK_COLORS[0];
              return (
                <span key={link.id} className={cls('link-label flow-base-label', compared && (removedLinks.has(link.id) ? 'diff-removed-link' : 'diff-same'))} style={{ left: at.x, top: at.y, color, borderColor: color }}>
                  {link.label}
                </span>
              );
            })}
          {flow.nodes.map((node) => (
            <BaseCard
              key={node.id}
              flow={flow}
              node={node}
              layout={layout}
              change={removed.has(node.id) ? 'removed' : compared?.diff.changes[node.id] === 'modified' ? 'modified' : undefined}
              comparing={!!compared}
              onMeasure={onMeasure}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Arrows of the current state, read only. Those the target no longer has
 * are dashed and grey; while comparing, the others are marked unchanged.
 */
export function BaseArrows(props: { routed: RoutedLink[]; removed: Set<Id>; comparing: boolean; prefix: string; width: number; height: number }) {
  const { routed, removed, comparing, prefix, width, height } = props;
  return (
    <svg className="links" width={width} height={height} aria-hidden="true">
      <defs>
        {routed.map(({ link }) => (
          <marker key={link.id} id={`mm-${prefix}-${link.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill={removed.has(link.id) ? REMOVED_GREY : (link.color ?? LINK_COLORS[0])} />
          </marker>
        ))}
      </defs>
      {routed.map(({ link, points }) => {
        const gone = removed.has(link.id);
        const dash = gone ? [5, 4] : LINK_DASH[link.style ?? 'solid'];
        const d = roundedPath(points);
        return (
          <g key={link.id} className={cls(comparing && (gone ? 'diff-removed-link' : 'diff-same'))} data-link={link.id}>
            {gone && <path d={d} className="link-diff-halo" fill="none" stroke={REMOVED_GREY} strokeWidth={7} strokeLinecap="round" />}
            <path
              d={d}
              fill="none"
              stroke={gone ? REMOVED_GREY : (link.color ?? LINK_COLORS[0])}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeDasharray={dash.length ? dash.join(' ') : undefined}
              markerEnd={`url(#mm-${prefix}-${link.id})`}
            />
          </g>
        );
      })}
    </svg>
  );
}

const REMOVED_GREY = '#98A2B3';

/**
 * A card of the current state, read only. `ghost`: a removed card drawn over
 * the target, at `node`'s place; `original` is where it was.
 */
export function BaseCard(props: {
  flow: Flow;
  node: FlowNode;
  layout: FlowLayout;
  change: Change | 'removed' | undefined;
  comparing: boolean;
  ghost?: boolean;
  original?: FlowNode;
  onMeasure: (id: Id, h: number) => void;
}) {
  const t = useT();
  const { flow, node, layout, change, comparing, ghost, onMeasure } = props;
  const original = props.original ?? node;
  const project = useStore((s) => s.project);
  const applyFlow = useStore((s) => s.applyFlow);
  const content = useRef<HTMLDivElement>(null);
  const box = nodeBox(node, layout);
  const pill = node.kind === 'start' || node.kind === 'end';
  const personaId = node.personaIds?.[0] ?? flow.personaId;
  const persona = personaId ? projectPersonas(project).find((p) => p.persona.id === personaId) : undefined;
  const accent = persona ? personaAccent(persona.persona.color, persona.style).accent : node.kind === 'choice' ? '#A16207' : '#2F55D4';
  // The card's fill, border and text, resolved as in the editable flow.
  const style = resolveStyle('node', flow.styles[`node:${node.id}`]);
  const fill = boxStyle(style);
  // A removed card keeps its dashed grey border.
  if (change === 'removed') delete fill.borderColor;
  useLayoutEffect(() => {
    const el = content.current;
    if (!el) return;
    const report = () => onMeasure(node.id, el.offsetHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [node.id, onMeasure]);
  return (
    <div
      className={cls('box flow-card flow-base-card', ghost && 'flow-ghost', `flow-${node.kind}`, change ? `diff-${change}` : comparing && 'diff-same')}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h, ...(pill ? {} : { ...fill, borderTopColor: accent }) }}
      {...(ghost ? { 'data-ghost-node': node.id } : { 'data-base-node': node.id })}
      onPointerEnter={ghost ? undefined : () => showTwin(node.id, 'base', true)}
      onPointerLeave={ghost ? undefined : () => showTwin(node.id, 'base', false)}
    >
      <div className="flow-card-content" ref={content}>
        {change === 'removed' ? <span className="change-tag change-removed">{t('state.removedTag')}</span> : change && <ChangeTag change={change} />}
        {node.kind === 'choice' && <span className="flow-choice-tag">{t('flow.kind.choice')}</span>}
        <div className={cls(pill ? 'flow-pill-text' : 'flow-text', !node.text.trim() && 'is-empty')} style={pill ? undefined : { ...textStyle(style), ...(node.text.trim() ? {} : { color: undefined }) }}>
          {node.text.trim() ? node.text : t(pill ? `flow.kind.${node.kind}` : node.kind === 'choice' ? 'flow.choicePlaceholder' : 'flow.activityPlaceholder')}
        </div>
        {change === 'removed' && !pill && (
          <button className="text-btn removed-restore" onClick={() => applyFlow((f) => restoreNode(f, flow, original))}>
            {t('state.restore')}
          </button>
        )}
      </div>
    </div>
  );
}
