// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Comparing a flow: going to a change, and showing a card's other version.
 * Cards are found by their data attributes: data-node in the target,
 * data-base-node in the current state above, data-ghost-node for removed
 * cards drawn over the target.
 */

import type { Id } from '../model/types';

const flashing = new Map<Element, number>();

/** Scrolls a changed card into the middle of its pane and makes it blink once. */
export function focusChange(id: Id, removed: boolean): boolean {
  const el = removed
    ? (document.querySelector(`[data-base-node="${CSS.escape(id)}"]`) ?? document.querySelector(`[data-ghost-node="${CSS.escape(id)}"]`))
    : document.querySelector(`[data-node="${CSS.escape(id)}"]`);
  if (!el) return false;
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  clearTimeout(flashing.get(el));
  el.classList.remove('diff-flash');
  // Restart the animation when the same card is picked again.
  void (el as HTMLElement).offsetWidth;
  el.classList.add('diff-flash');
  flashing.set(
    el,
    window.setTimeout(() => {
      el.classList.remove('diff-flash');
      flashing.delete(el);
    }, 1600),
  );
  return true;
}

/** Outlines the same card in the other pane, while the pointer is over one. */
export function showTwin(id: Id, from: 'target' | 'base', on: boolean) {
  const attr = from === 'target' ? 'data-base-node' : 'data-node';
  document.querySelector(`[${attr}="${CSS.escape(id)}"]`)?.classList.toggle('is-twin', on);
}
