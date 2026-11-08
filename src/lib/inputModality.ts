// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Tells the style sheets whether the last interaction came from a pointer or
 * the keyboard (`<html data-input="pointer|keyboard">`). Some webviews (WebKit
 * on macOS and Linux) still treat a click as keyboard focus and draw the focus
 * ring on the clicked button; the ring is kept for keyboard use only.
 */
export function installInputModality(root: HTMLElement = document.documentElement): void {
  const set = (mode: 'pointer' | 'keyboard') => {
    if (root.dataset.input !== mode) root.dataset.input = mode;
  };
  window.addEventListener('pointerdown', () => set('pointer'), true);
  window.addEventListener(
    'keydown',
    (e) => {
      // A shortcut (⌘S, Ctrl+Z…) does not move the focus: the ring stays hidden.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;
      set('keyboard');
    },
    true,
  );
}
