// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useLayoutEffect, type RefObject } from 'react';

/**
 * Gives a textarea the min-height its text needs, so its box grows with what
 * is typed. Measured rather than left to CSS: percentage heights in rows sized
 * by their content are resolved differently by Safari's engine.
 */
export function useFitText(ref: RefObject<HTMLTextAreaElement | null>, deps: unknown[]) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.minHeight = '0px';
      el.style.height = '0px';
      const needed = el.scrollHeight;
      el.style.height = '';
      el.style.minHeight = `${needed}px`;
    };
    fit();
    // Again once the web fonts are in, which changes the line breaks.
    document.fonts?.ready.then(fit);
    // The caller lists what changes the text's size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ...deps]);
}
