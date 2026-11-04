// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useStore, useT } from '../store';
import { docLabel, makeTargetDoc } from '../actions';
import { baselineOf, detachTarget, diffCounts, targetsOf } from '../model/states';
import { useFlowDiff, useMapDiff } from './useDiff';
import { ChevronLeft } from './Icons';

/**
 * In a map's or a flow's toolbar: copies it as its target state, or, once it
 * has one, goes to it.
 */
export function TargetButton() {
  const t = useT();
  const docId = useStore((s) => s.docId);
  const target = useStore((s) => targetsOf(s.project, s.docId).at(-1)?.id);
  const isTarget = useStore((s) => !!baselineOf(s.project, s.docId));
  const setDoc = useStore((s) => s.setDoc);
  if (isTarget) return null;
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
      {counts && (
        <span className="state-legend">
          <span className="state-count state-added">{t(counts.added <= 1 ? 'state.addedOne' : 'state.added', { n: counts.added })}</span>
          <span className="state-count state-modified">{t(counts.modified <= 1 ? 'state.modifiedOne' : 'state.modified', { n: counts.modified })}</span>
          <span className="state-count state-removed">{t(counts.removed <= 1 ? 'state.removedOne' : 'state.removed', { n: counts.removed })}</span>
        </span>
      )}
      <button className="text-btn toolbar-end" onClick={detach}>
        {t('state.detach')}
      </button>
    </div>
  );
}
