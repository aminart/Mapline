// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useId, useState, type PointerEvent as ReactPointerEvent } from 'react';

/**
 * Drag and drop on the board, driven by pointer events rather than the
 * HTML5 drag API, whose behaviour differs between the desktop webviews
 * (WebKitGTK does not deliver the drop reliably).
 */
export type Drag =
  | { kind: 'act'; key: string }
  | { kind: 'step'; index: number }
  | { kind: 'persona'; index: number }
  | { kind: 'divider'; id: string }
  /** grabX/grabY: where the block was taken, from its top left corner, in client pixels. */
  | { kind: 'block'; id: string; grabX: number; grabY: number }
  | { kind: 'fnode'; id: string };

/** Where the pointer was released, in client pixels. */
export interface DropPoint {
  x: number;
  y: number;
}

interface Target {
  kind: Drag['kind'];
  onDrop: (drag: Drag, at: DropPoint) => void;
  onHover?: (drag: Drag, at: DropPoint) => void;
  setOver: (over: boolean) => void;
}

const targets = new Map<string, Target>();
/** Pixels the pointer must travel before a press becomes a drag. */
const THRESHOLD = 4;
const EDGE = 48;

/** The innermost drop target of this kind under the point (targets can nest). */
function targetAt(x: number, y: number, kind: Drag['kind']): [string, Target] | null {
  let el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]');
  while (el) {
    const id = el.dataset.drop;
    const target = id ? targets.get(id) : undefined;
    if (id && target?.kind === kind) return [id, target];
    el = el.parentElement?.closest<HTMLElement>('[data-drop]');
  }
  return null;
}

/** Scrolls the board when dragging near its edges. */
function autoScroll(x: number, y: number) {
  const canvas = document.querySelector<HTMLElement>('.canvas');
  if (!canvas) return;
  const r = canvas.getBoundingClientRect();
  const dx = x < r.left + EDGE ? -14 : x > r.right - EDGE ? 14 : 0;
  const dy = y < r.top + EDGE ? -14 : y > r.bottom - EDGE ? 14 : 0;
  if (dx || dy) canvas.scrollBy(dx, dy);
}

/** Call from a drag handle's onPointerDown; `source` is shown under the pointer. */
export function startDrag(e: ReactPointerEvent, drag: Drag, source: HTMLElement | null) {
  if (e.button !== 0) return;
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  let ghost: HTMLElement | null = null;
  let hovered: [string, Target] | null = null;
  let offsetX = 0;
  let offsetY = 0;
  let scale = 1;

  const setHovered = (next: [string, Target] | null) => {
    if (hovered?.[0] === next?.[0]) return;
    hovered?.[1].setOver(false);
    next?.[1].setOver(true);
    hovered = next;
  };

  const onMove = (ev: PointerEvent) => {
    if (!ghost) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < THRESHOLD || !source) return;
      const r = source.getBoundingClientRect();
      offsetX = startX - r.left;
      offsetY = startY - r.top;
      ghost = source.cloneNode(true) as HTMLElement;
      ghost.classList.add('drag-ghost');
      // Cards placed on the board by left/top (flows) would keep that offset
      // from the pointer; the ghost is laid out at full size and scaled down
      // to the board's zoom.
      scale = source.offsetWidth ? r.width / source.offsetWidth : 1;
      Object.assign(ghost.style, { left: '0', top: '0', margin: '0', width: `${source.offsetWidth}px`, height: `${source.offsetHeight}px`, transformOrigin: '0 0' });
      document.body.appendChild(ghost);
      document.body.classList.add('is-dragging');
    }
    last = { x: ev.clientX, y: ev.clientY };
    ghost.style.transform = `translate(${ev.clientX - offsetX}px, ${ev.clientY - offsetY}px) scale(${scale})`;
    setHovered(targetAt(ev.clientX, ev.clientY, drag.kind));
    hovered?.[1].onHover?.(drag, last);
    autoScroll(ev.clientX, ev.clientY);
  };

  let last: DropPoint = { x: startX, y: startY };
  const finish = (drop: boolean) => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey, true);
    ghost?.remove();
    document.body.classList.remove('is-dragging');
    const target = hovered;
    setHovered(null);
    if (drop && ghost && target) target[1].onDrop(drag, last);
  };
  const onUp = () => finish(true);
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      finish(false);
    }
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey, true);
}

/** Makes an element accept drops of one kind; `over` is true while a drag hovers it. */
export function useDropTarget<K extends Drag['kind']>(
  kind: K,
  onDrop: (drag: Extract<Drag, { kind: K }>, at: DropPoint) => void,
  /** Called as the pointer moves over the target, to show where the drop would land. */
  onHover?: (drag: Extract<Drag, { kind: K }>, at: DropPoint) => void,
) {
  const id = useId();
  const [over, setOver] = useState(false);
  // Re-registered each render so the callback sees current props.
  targets.set(id, { kind, onDrop: onDrop as (drag: Drag, at: DropPoint) => void, onHover: onHover as Target['onHover'], setOver });
  useEffect(() => () => void targets.delete(id), [id]);
  return { over, props: { 'data-drop': id } };
}
