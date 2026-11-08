// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useStore, useT } from '../store';
import * as fo from '../model/flow';
import { flowLayout, flowSize, nodeBox, type FlowLayout } from '../model/flowLayout';
import { projectPersonas } from '../model/project';
import { baselineOf, restoreNode, type Change } from '../model/states';
import type { Flow, FlowNode, Id } from '../model/types';
import { routeFlow } from '../lib/flowRoute';
import { pointAlong, roundedPath } from '../lib/arrows';
import { LINK_COLORS, LINK_DASH, boxStyle, personaAccent, resolveStyle, textStyle } from '../model/theme';
import { useFlowDiff } from './useDiff';
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
  const [measured, setMeasured] = useState<Record<Id, number>>({});
  const onMeasure = useCallback((id: Id, h: number) => setMeasured((m) => (Math.abs((m[id] ?? 0) - h) < 1 ? m : { ...m, [id]: h })), []);
  if (base?.kind !== 'flow') return null;
  const flow = base.flow;
  const layout = flowLayout(flow, measured);
  const { cols, rows } = fo.extent(flow);
  // The same spare column and row as the target, so both line up.
  const size = flowSize(cols + 1, rows + 1, layout);
  const removed = new Set(compared?.diff.removed.map((n) => n.id));
  return (
    <div className="board-zoom" style={{ zoom } as CSSProperties}>
      <div className="flow-doc flow-base" style={{ width: Math.max(size.w, 640) }}>
        <div className="flow-base-title">
          <span className="state-badge">{t('state.current')}</span>
          <span className="muted-sm">{t('state.readOnly')}</span>
        </div>
        <div className="flow" style={{ width: size.w, height: size.h }}>
          <BaseArrows flow={flow} layout={layout} width={size.w} height={size.h} />
          {routeFlow(flow, layout)
            .filter(({ link }) => link.label)
            .map(({ link, points }) => {
              const at = pointAlong(points, 0.25);
              const color = link.color ?? LINK_COLORS[0];
              return (
                <span key={link.id} className="link-label flow-base-label" style={{ left: at.x, top: at.y, color, borderColor: color }}>
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
              onMeasure={onMeasure}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function BaseArrows({ flow, layout, width, height }: { flow: Flow; layout: FlowLayout; width: number; height: number }) {
  const routed = routeFlow(flow, layout);
  return (
    <svg className="links" width={width} height={height} aria-hidden="true">
      <defs>
        {routed.map(({ link }) => (
          <marker key={link.id} id={`mm-base-${link.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill={link.color ?? LINK_COLORS[0]} />
          </marker>
        ))}
      </defs>
      {routed.map(({ link, points }) => {
        const dash = LINK_DASH[link.style ?? 'solid'];
        return (
          <path
            key={link.id}
            d={roundedPath(points)}
            fill="none"
            stroke={link.color ?? LINK_COLORS[0]}
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeDasharray={dash.length ? dash.join(' ') : undefined}
            markerEnd={`url(#mm-base-${link.id})`}
          />
        );
      })}
    </svg>
  );
}

function BaseCard(props: { flow: Flow; node: FlowNode; layout: FlowLayout; change: Change | 'removed' | undefined; onMeasure: (id: Id, h: number) => void }) {
  const t = useT();
  const { flow, node, layout, change, onMeasure } = props;
  const project = useStore((s) => s.project);
  const applyFlow = useStore((s) => s.applyFlow);
  const content = useRef<HTMLDivElement>(null);
  const box = nodeBox(node, layout);
  const pill = node.kind === 'start' || node.kind === 'end';
  const personaId = node.personaId ?? flow.personaId;
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
      className={cls('box flow-card flow-base-card', `flow-${node.kind}`, change && `diff-${change}`)}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h, ...(pill ? {} : { ...fill, borderTopColor: accent }) }}
      data-base-node={node.id}
    >
      <div className="flow-card-content" ref={content}>
        {change === 'removed' ? <span className="change-tag change-removed">{t('state.removedTag')}</span> : change && <ChangeTag change={change} />}
        {node.kind === 'choice' && <span className="flow-choice-tag">{t('flow.kind.choice')}</span>}
        <div className={cls(pill ? 'flow-pill-text' : 'flow-text', !node.text.trim() && 'is-empty')} style={pill ? undefined : { ...textStyle(style), ...(node.text.trim() ? {} : { color: undefined }) }}>
          {node.text.trim() ? node.text : t(pill ? `flow.kind.${node.kind}` : node.kind === 'choice' ? 'flow.choicePlaceholder' : 'flow.activityPlaceholder')}
        </div>
        {change === 'removed' && !pill && (
          <button className="text-btn removed-restore" onClick={() => applyFlow((f) => restoreNode(f, flow, node))}>
            {t('state.restore')}
          </button>
        )}
      </div>
    </div>
  );
}
