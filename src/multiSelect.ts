// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Multiple selection: Shift + click (or Cmd + click on macOS, Ctrl + click
 * elsewhere) on a card, a step or a phase adds it to the selection, or takes
 * it out. Picking a box of another kind starts a new selection. The picked
 * boxes are then copied, duplicated, styled or deleted together.
 */

import { useStore } from './store';

/** The boxes that can be picked together, and the key each one is selected by. */
const PICKABLE: [selector: string, key: (el: HTMLElement) => string | undefined][] = [
  ['.box.card[data-act]', (el) => el.dataset.act && `act:${el.dataset.act}`],
  ['.box.step[data-step]', (el) => el.dataset.step && `step:${el.dataset.step}`],
  ['.box.phase[data-phase]', (el) => el.dataset.phase && `phase:${el.dataset.phase}`],
  ['.box.flow-card[data-node]', (el) => el.dataset.node && `node:${el.dataset.node}`],
];

/** The box under `target` that can be picked, and its key. */
function pickable(target: Element): string | undefined {
  // Its buttons, grips and tags keep their own clicks.
  if (target.closest('button, input, select, a, .grip, .tags, .note, .link-target')) return undefined;
  for (const [selector, key] of PICKABLE) {
    const el = target.closest<HTMLElement>(selector);
    if (el) return key(el);
  }
  return undefined;
}

export function installMultiSelect(): () => void {
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || !(e.shiftKey || e.metaKey || e.ctrlKey) || e.altKey) return;
    const s = useStore.getState();
    if (s.presentStep !== null || s.tool !== 'select' || !s.activeId) return;
    const target = e.target as Element;
    // Shift + click in the text being typed extends the text selection.
    if (target === document.activeElement) return;
    const key = pickable(target);
    if (!key) return;
    e.preventDefault();
    e.stopPropagation();
    // The picked boxes are worked on together, not typed in.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    s.toggleSelect(key);
  };
  document.addEventListener('pointerdown', onPointerDown, true);
  return () => document.removeEventListener('pointerdown', onPointerDown, true);
}
