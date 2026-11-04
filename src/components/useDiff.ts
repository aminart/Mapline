// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useStore } from '../store';
import { baselineOf, diffFlow, diffMap, type Diff } from '../model/states';
import { findDoc } from '../model/project';
import type { Activity, Blueprint, Flow, FlowNode } from '../model/types';

type MapDiff = Diff<{ key: string; activity: Activity }>;
type FlowDiff = Diff<FlowNode>;

// The last diff worked out, reused while neither document changes.
let mapMemo: { base: Blueprint; target: Blueprint; diff: MapDiff } | null = null;
let flowMemo: { base: Flow; target: Flow; diff: FlowDiff } | null = null;

/** What changed in the map shown since its current state, while comparing; null otherwise. */
export function useMapDiff(): MapDiff | null {
  return useStore((s) => {
    if (!s.compare) return null;
    const doc = findDoc(s.project, s.docId);
    const base = baselineOf(s.project, s.docId);
    if (doc?.kind !== 'mission-map' || base?.kind !== 'mission-map') return null;
    if (mapMemo?.base !== base.map || mapMemo.target !== doc.map) mapMemo = { base: base.map, target: doc.map, diff: diffMap(base.map, doc.map) };
    return mapMemo.diff;
  });
}

/** What changed in the flow shown since its current state, while comparing; null otherwise. */
export function useFlowDiff(): { diff: FlowDiff; base: Flow } | null {
  const diff = useStore((s) => {
    if (!s.compare) return null;
    const doc = findDoc(s.project, s.docId);
    const base = baselineOf(s.project, s.docId);
    if (doc?.kind !== 'flow' || base?.kind !== 'flow') return null;
    if (flowMemo?.base !== base.flow || flowMemo.target !== doc.flow) flowMemo = { base: base.flow, target: doc.flow, diff: diffFlow(base.flow, doc.flow) };
    return flowMemo.diff;
  });
  return diff && flowMemo ? { diff, base: flowMemo.base } : null;
}

/** A flow's target state shown under its current state, while comparing. */
export function useFlowSplit(): boolean {
  return useStore((s) => s.compare && findDoc(s.project, s.docId)?.kind === 'flow' && baselineOf(s.project, s.docId)?.kind === 'flow');
}
