// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { activeFlow, useStore, useT } from '../store';
import { docLabel, makeTargetDoc } from '../actions';
import { useState } from 'react';
import { baselineOf, detachTarget, detachedBaseOf, diffCounts, flowChanges, reattachTarget, targetsOf, type FlowChange } from '../model/states';
import { useFlowDiff, useMapDiff } from './useDiff';
import { focusChange } from './compareNav';
import { ChevronLeft, ChevronRight } from './Icons';
import { cls } from './cls';

/**
 * In a map's or a flow's toolbar: copies it as its target state, or, once it
 * has one, goes to it. On a target no longer compared, compares it again.
 */
export function TargetButton() {
  const t = useT();
  const docId = useStore((s) => s.docId);
  const target = useStore((s) => targetsOf(s.project, s.docId).at(-1)?.id);
  const isTarget = useStore((s) => !!baselineOf(s.project, s.docId));
  const formerBase = useStore((s) => detachedBaseOf(s.project, s.docId));
  const project = useStore((s) => s.project);
  const setDoc = useStore((s) => s.setDoc);
  const applyProject = useStore((s) => s.applyProject);
  const setCompare = useStore((s) => s.setCompare);
  if (isTarget) return null;
  if (formerBase && !target)
    return (
      <button
        className="btn btn-sm toolbar-end"
        title={t('state.reattachHint', { name: docLabel(project, formerBase.id) })}
        onClick={() => {
          applyProject((p) => reattachTarget(p, docId));
          setCompare(true);
        }}
      >
        {t('state.reattach')}
      </button>
    );
  return target ? (
    <button className="btn btn-sm toolbar-end" onClick={() => setDoc(target)}>
      {t('state.openTarget')}
    </button>
  ) : (
    <button className="btn btn-sm toolbar-end" title={t('state.makeHint')} onClick={() => makeTargetDoc(docId)}>
      {t('state.make')}
    </button>
  );
}

/**
 * Over a target state: the current state it is compared with, the switch
 * that shows the changes, and how many cards were added, changed, removed.
 */
export function StateBar() {
  const t = useT();
  const project = useStore((s) => s.project);
  const docId = useStore((s) => s.docId);
  const compare = useStore((s) => s.compare);
  const setCompare = useStore((s) => s.setCompare);
  const setDoc = useStore((s) => s.setDoc);
  const applyProject = useStore((s) => s.applyProject);
  const mapDiff = useMapDiff();
  const flowDiff = useFlowDiff();
  const base = baselineOf(project, docId);
  if (!base) return null;
  const diff = mapDiff ?? flowDiff?.diff;
  const counts = diff ? diffCounts(diff) : null;
  const detach = () => {
    if (window.confirm(t('state.detachConfirm', { name: docLabel(project, base.id) }))) applyProject((p) => detachTarget(p, docId));
  };
  return (
    <div className="state-bar" role="region" aria-label={t('state.label')}>
      <span className="state-badge state-badge-target">{t('state.target')}</span>
      <button className="state-base" title={t('state.openBase')} onClick={() => setDoc(base.id)}>
        <ChevronLeft size={12} />
        {t('state.comparedWith')} <strong>{docLabel(project, base.id)}</strong>
      </button>
      <span className="state-sep" aria-hidden="true" />
      <label className="toggle toggle-inline">
        <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
        <span>{t('state.compare')}</span>
      </label>
      {counts && !flowDiff && (
        <span className="state-legend">
          <span className="state-count state-added">{t(counts.added <= 1 ? 'state.addedOne' : 'state.added', { n: counts.added })}</span>
          <span className="state-count state-modified">{t(counts.modified <= 1 ? 'state.modifiedOne' : 'state.modified', { n: counts.modified })}</span>
          <span className="state-count state-removed">{t(counts.removed <= 1 ? 'state.removedOne' : 'state.removed', { n: counts.removed })}</span>
        </span>
      )}
      {flowDiff && <FlowCompareTools />}
      <button className="text-btn toolbar-end" onClick={detach}>
        {t('state.detach')}
      </button>
    </div>
  );
}

const KINDS = ['added', 'modified', 'removed'] as const;

/**
 * While comparing a flow: how it is shown (two panes or overlaid), fading
 * what didn't change, the changes counted, and going from one to the next.
 */
function FlowCompareTools() {
  const t = useT();
  const compared = useFlowDiff();
  const flow = useStore((s) => activeFlow(s));
  const view = useStore((s) => s.compareView);
  const setView = useStore((s) => s.setCompareView);
  const focus = useStore((s) => s.compareFocus);
  const setFocus = useStore((s) => s.setCompareFocus);
  const [at, setAt] = useState(-1);
  if (!compared || !flow) return null;
  const changes = flowChanges(flow, compared.diff);
  const counts = diffCounts(compared.diff);
  const links = compared.links;
  const current = at >= 0 && at < changes.length ? at : -1;
  const go = (i: number) => {
    const n = changes.length;
    if (!n) return;
    const next = ((i % n) + n) % n;
    setAt(next);
    focusChange(changes[next].id, changes[next].change === 'removed');
  };
  // The next change of that kind after the one shown.
  const goKind = (kind: FlowChange['change']) => {
    for (let k = 1; k <= changes.length; k++) {
      const i = (current + k) % changes.length;
      if (changes[i].change === kind) return go(i);
    }
  };
  const label = (kind: (typeof KINDS)[number], n: number) => t(n <= 1 ? `state.${kind}One` : `state.${kind}`, { n });
  return (
    <>
      <div className="segmented segmented-sm state-view" role="group" aria-label={t('state.view')}>
        {(['split', 'merged'] as const).map((v) => (
          <button key={v} className={cls(view === v && 'is-on')} aria-pressed={view === v} onClick={() => setView(v)}>
            {t(v === 'split' ? 'state.viewSplit' : 'state.viewMerged')}
          </button>
        ))}
      </div>
      <label className="toggle toggle-inline">
        <input type="checkbox" checked={focus} onChange={(e) => setFocus(e.target.checked)} />
        <span>{t('state.focus')}</span>
      </label>
      <span className="state-legend">
        {KINDS.map((kind) => (
          <button key={kind} className={`state-count state-${kind} state-jump`} disabled={!counts[kind]} title={t('state.jump')} onClick={() => goKind(kind)}>
            {label(kind, counts[kind])}
          </button>
        ))}
        {(links.added.length > 0 || links.modified.length > 0 || links.removed.length > 0) && (
          <span className="state-links">
            {t('state.links')}{' '}
            {[
              links.added.length && label('added', links.added.length),
              links.modified.length && label('modified', links.modified.length),
              links.removed.length && label('removed', links.removed.length),
            ]
              .filter(Boolean)
              .join(', ')}
          </span>
        )}
      </span>
      {changes.length > 0 && (
        <span className="state-nav">
          <button className="icon-btn" aria-label={t('state.prev')} title={t('state.prev')} onClick={() => go(current < 0 ? changes.length - 1 : current - 1)}>
            <ChevronLeft size={14} />
          </button>
          <span className="state-nav-pos">{current < 0 ? t(changes.length === 1 ? 'state.navCountOne' : 'state.navCount', { n: changes.length }) : t('state.navAt', { i: current + 1, n: changes.length })}</span>
          <button className="icon-btn" aria-label={t('state.next')} title={t('state.next')} onClick={() => go(current + 1)}>
            <ChevronRight size={14} />
          </button>
        </span>
      )}
    </>
  );
}
