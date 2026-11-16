// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

// The pipette: picks a colour to apply. Three ways, the best one available:
// - the macOS app asks the system's colour sampler (any colour on the screen),
//   since WebKit has no EyeDropper;
// - Chromium and WebView2 (the Windows app) have the EyeDropper API;
// - elsewhere (the Linux app, Safari), an in-page pipette: the next click on
//   the page takes the colour of what is under the pointer.

import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from './fileio';
import { cssColorToHex } from '../model/usedColors';

interface EyeDropperLike {
  open(): Promise<{ sRGBHex: string }>;
}
declare global {
  interface Window {
    EyeDropper?: new () => EyeDropperLike;
  }
}

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent);

let sampling = false;
/** While picking, a click elsewhere must not close the colour menu. */
export const isSampling = () => sampling;

/** The picked colour as #RRGGBB, or null when cancelled; `hint` is shown during an in-page pick. */
export async function pickColor(hint: string): Promise<string | null> {
  if (sampling) return null;
  sampling = true;
  try {
    if (isDesktop && isMac) {
      const hex = await invoke<string | null>('pick_screen_color');
      return hex ? cssColorToHex(hex) : null;
    }
    if (window.EyeDropper) {
      try {
        const { sRGBHex } = await new window.EyeDropper().open();
        return cssColorToHex(sRGBHex);
      } catch {
        return null; // Échap
      }
    }
    return await pickInPage(hint);
  } finally {
    // Leave the click that ended the pick behind before menus listen again.
    setTimeout(() => (sampling = false), 0);
  }
}

/** The colour shown at a point of the page: the first opaque background under it, else its text colour. */
export function colorAt(x: number, y: number): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (el.classList.contains('pipette-hint')) continue;
    const style = getComputedStyle(el);
    const bg = cssColorToHex(style.backgroundColor);
    if (bg) return bg;
    if (el instanceof SVGElement) {
      const stroke = cssColorToHex(style.stroke);
      if (stroke) return stroke;
      const fill = cssColorToHex(style.fill);
      if (fill) return fill;
    }
  }
  return null;
}

function pickInPage(hint: string): Promise<string | null> {
  return new Promise((resolve) => {
    const root = document.documentElement;
    root.classList.add('is-sampling');
    const tip = document.createElement('div');
    tip.className = 'pipette-hint';
    tip.setAttribute('role', 'status');
    tip.textContent = hint;
    document.body.append(tip);
    const swallow = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'dblclick', 'contextmenu'] as const;
    const done = (hex: string | null) => {
      root.classList.remove('is-sampling');
      tip.remove();
      for (const t of events) window.removeEventListener(t, swallow, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKey, true);
      resolve(hex);
    };
    const onClick = (e: MouseEvent) => {
      swallow(e);
      done(colorAt(e.clientX, e.clientY));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      swallow(e);
      done(null);
    };
    window.addEventListener('keydown', onKey, true);
    // Registered after the click that started the pick has been handled.
    setTimeout(() => {
      if (!tip.isConnected) return; // already cancelled
      for (const t of events) window.addEventListener(t, swallow, true);
      window.addEventListener('click', onClick, true);
    }, 0);
  });
}
